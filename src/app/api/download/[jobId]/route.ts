import { apiRoute, jsonResponse } from "@/lib/api/handler.ts";
import { getJob, toJobView } from "@/lib/jobs/jobManager.ts";
import { AppError } from "@/lib/server/errors.ts";

/** GET /api/download/:jobId — job status, polled by the browser while the file is prepared. */
export const GET = apiRoute<{ jobId: string }>(async ({ session, params }) => {
  const job = getJob(session.id, params.jobId);
  if (!job) throw new AppError("not_found", "Download not found. It may have been removed or belong to another browser.", 404);
  return jsonResponse({ job: toJobView(job) });
});
