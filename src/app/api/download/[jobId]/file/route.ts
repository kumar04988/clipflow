import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import type { NextRequest } from "next/server";
import { apiRoute } from "@/lib/api/handler.ts";
import { expireJob, getJob, markDelivered } from "@/lib/jobs/jobManager.ts";
import { getConfig } from "@/lib/server/config.ts";
import { contentDisposition, mimeTypeFor } from "@/lib/download/filename.ts";
import { fileErrorResponse } from "@/lib/download/errorPage.ts";
import { parseRange } from "@/lib/download/range.ts";
import type { Session } from "@/lib/security/session.ts";

async function serveFile(request: NextRequest, session: Session, jobId: string, headOnly: boolean): Promise<Response> {
  const job = getJob(session.id, jobId);
  if (!job) return fileErrorResponse(request, 404, "not_found", "This download link is invalid, or it was created in a different browser.");

  if (job.status === "ready" && (job.expiresAt ?? 0) <= Date.now()) await expireJob(job);
  if (job.status === "expired") {
    return fileErrorResponse(request, 410, "expired", "This file has expired and was deleted from the server. Analyze the link again to prepare a new one.");
  }
  if (job.status !== "ready") {
    return fileErrorResponse(request, 409, "not_ready", "This file isn’t ready yet. Go back and wait until it says “Ready to save”.");
  }
  // A media job has one file per chosen item, picked with ?item=<position in the post>.
  const item = request.nextUrl.searchParams.get("item");
  const mediaFile = job.files && item !== null ? job.files.find((file) => String(file.item.index) === item) : undefined;
  const target = mediaFile ? { path: mediaFile.path, name: mediaFile.name } : job.filePath && job.fileName ? { path: job.filePath, name: job.fileName } : null;
  if (!target) return fileErrorResponse(request, 404, "not_found", "This download link is invalid.");

  // Defense in depth: the path must be inside the jobs folder.
  const filePath = path.resolve(target.path);
  if (!filePath.startsWith(path.resolve(getConfig().jobsDir) + path.sep)) {
    return fileErrorResponse(request, 404, "not_found", "This download link is invalid.");
  }
  const stat = await fsp.stat(filePath).catch(() => null);
  if (!stat?.isFile()) {
    await expireJob(job);
    return fileErrorResponse(request, 410, "expired", "This file is no longer available on the server. Analyze the link again to prepare a new one.");
  }

  const range = parseRange(request.headers.get("range"), stat.size);
  if (range === "unsatisfiable") {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
  }
  const start = range?.start ?? 0;
  const end = range?.end ?? stat.size - 1;
  const headers: Record<string, string> = {
    "Content-Type": mimeTypeFor(path.extname(filePath).slice(1)),
    "Content-Length": String(end - start + 1),
    "Content-Disposition": contentDisposition(target.name),
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (range) headers["Content-Range"] = `bytes ${start}-${end}/${stat.size}`;
  if (headOnly) return new Response(null, { status: range ? 206 : 200, headers });

  // Streamed from disk in chunks — the file is never loaded into memory.
  const fileStream = fs.createReadStream(filePath, { start, end });
  if (end === stat.size - 1) fileStream.once("end", () => markDelivered(job, mediaFile));
  return new Response(Readable.toWeb(fileStream) as unknown as ReadableStream<Uint8Array>, {
    status: range ? 206 : 200,
    headers,
  });
}

/** GET /api/download/:jobId/file — the prepared file as an attachment (supports Range for resuming). */
export const GET = apiRoute<{ jobId: string }>(({ request, session, params }) => serveFile(request, session, params.jobId, false));

export const HEAD = apiRoute<{ jobId: string }>(({ request, session, params }) => serveFile(request, session, params.jobId, true));
