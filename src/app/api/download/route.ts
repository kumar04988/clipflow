import { z } from "zod";
import { apiRoute, jsonResponse } from "@/lib/api/handler.ts";
import { createDownloadRequestSchema, createMediaDownloadRequestSchema } from "@/lib/api/schemas.ts";
import { readJsonBody } from "@/lib/security/requestGuard.ts";
import { clientKey, enforceRateLimit } from "@/lib/security/rateLimit.ts";
import { getConfig } from "@/lib/server/config.ts";
import { createJob, createMediaJob, toJobView } from "@/lib/jobs/jobManager.ts";

const requestSchema = z.union([createDownloadRequestSchema, createMediaDownloadRequestSchema]);

/** POST /api/download — starts preparing a file: a quality option of a video, or chosen items of a post. */
export const POST = apiRoute(
  async ({ request, session }) => {
    const body = requestSchema.parse(await readJsonBody(request));
    enforceRateLimit("download", clientKey(request, session.id), getConfig().rateLimitDownloadPerMinute);
    const { job, existing } =
      "items" in body ? await createMediaJob(session.id, body.analysisId, body.items) : await createJob(session.id, body.analysisId, body.optionId);
    return jsonResponse({ job: toJobView(job) }, existing ? 200 : 201);
  },
  { mutating: true },
);
