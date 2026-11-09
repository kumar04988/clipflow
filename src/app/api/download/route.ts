import { apiRoute, jsonResponse } from "@/lib/api/handler.ts";
import { createDownloadRequestSchema } from "@/lib/api/schemas.ts";
import { readJsonBody } from "@/lib/security/requestGuard.ts";
import { clientKey, enforceRateLimit } from "@/lib/security/rateLimit.ts";
import { getConfig } from "@/lib/server/config.ts";
import { createJob, toJobView } from "@/lib/jobs/jobManager.ts";

/** POST /api/download — starts preparing a file for an option from a previous analysis. */
export const POST = apiRoute(
  async ({ request, session }) => {
    const { analysisId, optionId } = createDownloadRequestSchema.parse(await readJsonBody(request));
    enforceRateLimit("download", clientKey(request, session.id), getConfig().rateLimitDownloadPerMinute);
    const { job, existing } = await createJob(session.id, analysisId, optionId);
    return jsonResponse({ job: toJobView(job) }, existing ? 200 : 201);
  },
  { mutating: true },
);
