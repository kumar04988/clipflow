import type { NextRequest } from "next/server";
import { AppError } from "../server/errors.ts";

/**
 * Blocks cross-site requests to state-changing endpoints (CSRF).
 * Modern browsers send Sec-Fetch-Site; older ones are checked with the Origin header.
 */
export function assertSameOrigin(request: NextRequest): void {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    throw new AppError("forbidden", "Cross-site requests are not allowed.", 403);
  }
  const origin = request.headers.get("origin");
  if (!origin) return;
  const allowedHosts = new Set([request.headers.get("host"), request.headers.get("x-forwarded-host"), request.nextUrl.host]);
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new AppError("forbidden", "Cross-site requests are not allowed.", 403);
  }
  if (!allowedHosts.has(originHost)) throw new AppError("forbidden", "Cross-site requests are not allowed.", 403);
}

const MAX_JSON_BYTES = 16 * 1024;

/** Reads a small JSON body, rejecting other content types and oversized payloads. */
export async function readJsonBody(request: NextRequest): Promise<unknown> {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
    throw new AppError("unsupported_media_type", "Requests must be sent as JSON.", 415);
  }
  const text = await request.text();
  if (text.length > MAX_JSON_BYTES) throw new AppError("payload_too_large", "The request is too large.", 413);
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError("invalid_json", "The request body isn’t valid JSON.", 400);
  }
}
