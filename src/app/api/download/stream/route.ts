import { ZodError } from "zod";
import { apiRoute } from "@/lib/api/handler.ts";
import { createDownloadRequestSchema } from "@/lib/api/schemas.ts";
import { clientKey, enforceRateLimit } from "@/lib/security/rateLimit.ts";
import { getConfig } from "@/lib/server/config.ts";
import { AppError } from "@/lib/server/errors.ts";
import { contentDisposition } from "@/lib/download/filename.ts";
import { fileErrorResponse } from "@/lib/download/errorPage.ts";
import { startStreamDownload } from "@/lib/download/stream.ts";

/**
 * GET /api/download/stream?analysisId=…&optionId=… — sends the file while it is being made, so the
 * browser's download starts at once. Opened as a normal link, so errors are shown as a page.
 */
export const GET = apiRoute(async ({ request, session }) => {
  try {
    const { analysisId, optionId } = createDownloadRequestSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    enforceRateLimit("download", clientKey(request, session.id), getConfig().rateLimitDownloadPerMinute);
    const download = await startStreamDownload(session.id, analysisId, optionId, request.signal);
    // No Content-Length: the final size is only known at the end, so browsers can't show a percentage.
    return new Response(download.body, {
      headers: {
        "Content-Type": download.contentType,
        "Content-Disposition": contentDisposition(download.fileName),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    if (error instanceof AppError) return fileErrorResponse(request, error.status, error.code, error.message);
    if (error instanceof ZodError) return fileErrorResponse(request, 400, "invalid_request", "This download link is invalid.");
    throw error;
  }
});
