// A tiny forward proxy that every yt-dlp request goes through.
// It resolves each destination itself and refuses private/internal addresses, so SSRF is blocked
// for the first request, for every redirect and for every media/CDN request — not only the submitted URL.

import http from "node:http";
import net from "node:net";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { BlockedDestinationError, resolvePublicAddress } from "./resolve.ts";

export interface EgressProxy {
  /** Proxy URL with credentials, for yt-dlp's --proxy option. */
  url: string;
  port: number;
  close: () => Promise<void>;
}

const ALLOWED_PORTS = new Set([80, 443, 8080, 8443]);
const IDLE_TIMEOUT_MS = 120_000;
const BLOCK_REASON = "Blocked by ClipFlow network policy";

function parseAuthority(authority: string): { host: string; port: number } | null {
  const match = /^\[?([^\]]+?)\]?:(\d{1,5})$/.exec(authority);
  if (!match) return null;
  const port = Number(match[2]);
  return port > 0 && port < 65536 ? { host: match[1], port } : null;
}

function rejectSocket(socket: net.Socket, status: number, reason: string, extraHeaders = ""): void {
  if (socket.destroyed) return;
  socket.end(`HTTP/1.1 ${status} ${reason}\r\nContent-Length: 0\r\nConnection: close\r\n${extraHeaders}\r\n`);
}

export async function startEgressProxy(): Promise<EgressProxy> {
  const username = "clipflow";
  const password = randomBytes(18).toString("base64url");
  const expectedAuth = Buffer.from(`Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`);

  // Only our own yt-dlp processes know the random password.
  const isAuthorized = (header: string | undefined) => {
    const given = Buffer.from(header ?? "");
    return given.length === expectedAuth.length && timingSafeEqual(given, expectedAuth);
  };

  const server = http.createServer(async (request, response) => {
    // Plain-HTTP requests arrive in absolute form: "GET http://host/path HTTP/1.1".
    if (!isAuthorized(request.headers["proxy-authorization"])) {
      response.writeHead(407, { "Proxy-Authenticate": 'Basic realm="clipflow"' }).end();
      return;
    }
    let target: URL;
    try {
      target = new URL(request.url ?? "");
    } catch {
      response.writeHead(400).end();
      return;
    }
    const port = Number(target.port || 80);
    if (target.protocol !== "http:" || !ALLOWED_PORTS.has(port)) {
      response.writeHead(403, BLOCK_REASON).end();
      return;
    }

    try {
      const { address, family } = await resolvePublicAddress(target.hostname);
      const headers = { ...request.headers };
      delete headers["proxy-authorization"];
      delete headers["proxy-connection"];
      headers.host = target.host;

      const upstream = http.request({
        host: address,
        family,
        port,
        method: request.method,
        path: `${target.pathname}${target.search}`,
        headers,
        setHost: false,
        timeout: IDLE_TIMEOUT_MS,
      });
      upstream.on("response", (upstreamResponse) => {
        response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
        upstreamResponse.pipe(response);
      });
      upstream.on("timeout", () => upstream.destroy());
      upstream.on("error", () => {
        if (!response.headersSent) response.writeHead(502).end();
        else response.destroy();
      });
      request.pipe(upstream);
    } catch (error) {
      const blocked = error instanceof BlockedDestinationError;
      response.writeHead(blocked ? 403 : 502, blocked ? BLOCK_REASON : "Bad Gateway").end();
    }
  });

  // HTTPS goes through CONNECT tunnels: "CONNECT host:443".
  server.on("connect", async (request: http.IncomingMessage, clientSocket: net.Socket, head: Buffer) => {
    clientSocket.on("error", () => clientSocket.destroy());
    if (!isAuthorized(request.headers["proxy-authorization"])) {
      rejectSocket(clientSocket, 407, "Proxy Authentication Required", 'Proxy-Authenticate: Basic realm="clipflow"\r\n');
      return;
    }
    const authority = parseAuthority(request.url ?? "");
    if (!authority || !ALLOWED_PORTS.has(authority.port)) {
      rejectSocket(clientSocket, 403, BLOCK_REASON);
      return;
    }

    let resolved;
    try {
      resolved = await resolvePublicAddress(authority.host);
    } catch (error) {
      rejectSocket(clientSocket, error instanceof BlockedDestinationError ? 403 : 502, error instanceof BlockedDestinationError ? BLOCK_REASON : "Bad Gateway");
      return;
    }

    // Connect to the address we checked — never re-resolve the name (prevents DNS rebinding).
    const upstream = net.connect({ host: resolved.address, family: resolved.family, port: authority.port });
    upstream.setTimeout(IDLE_TIMEOUT_MS, () => upstream.destroy());
    clientSocket.setTimeout(IDLE_TIMEOUT_MS, () => clientSocket.destroy());
    upstream.once("connect", () => {
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length > 0) upstream.write(head);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });
    upstream.on("error", () => {
      if (!clientSocket.destroyed) rejectSocket(clientSocket, 502, "Bad Gateway");
    });
    clientSocket.on("close", () => upstream.destroy());
    upstream.on("close", () => clientSocket.destroy());
  });

  server.on("clientError", (_error, socket) => socket.destroy());

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  server.unref();

  const { port } = server.address() as net.AddressInfo;
  return {
    url: `http://${username}:${password}@127.0.0.1:${port}`,
    port,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
