import { apiRoute, jsonResponse } from "@/lib/api/handler.ts";
import { cancelJob, toJobView } from "@/lib/jobs/jobManager.ts";

/** POST /api/download/:jobId/cancel — stops processing and deletes partial files. */
export const POST = apiRoute<{ jobId: string }>(
  async ({ session, params }) => {
    const job = await cancelJob(session.id, params.jobId);
    return jsonResponse({ job: toJobView(job) });
  },
  { mutating: true },
);
