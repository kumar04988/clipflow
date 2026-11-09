import { apiRoute, jsonResponse } from "@/lib/api/handler.ts";
import { expireJob, getJob, isJobId } from "@/lib/jobs/jobManager.ts";
import { removeHistory } from "@/lib/storage/historyStore.ts";
import { AppError } from "@/lib/server/errors.ts";
import { isActiveStatus } from "@/types/index.ts";

/** DELETE /api/history/:jobId — removes one entry (and its file). */
export const DELETE = apiRoute<{ jobId: string }>(
  async ({ session, params }) => {
    if (!isJobId(params.jobId)) throw new AppError("not_found", "History entry not found.", 404);
    const job = getJob(session.id, params.jobId);
    if (job && isActiveStatus(job.status)) {
      throw new AppError("job_active", "This download is still being prepared. Cancel it first.", 409);
    }
    if (job) await expireJob(job);
    if (!removeHistory(session.id, params.jobId)) throw new AppError("not_found", "History entry not found.", 404);
    return jsonResponse({ removed: true });
  },
  { mutating: true },
);
