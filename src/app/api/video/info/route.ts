import { apiRoute, jsonResponse } from "@/lib/api/handler.ts";
import { videoInfoRequestSchema } from "@/lib/api/schemas.ts";
import { readJsonBody } from "@/lib/security/requestGuard.ts";
import { clientKey, enforceRateLimit } from "@/lib/security/rateLimit.ts";
import { getConfig } from "@/lib/server/config.ts";
import { analyzeVideo } from "@/lib/video/analyze.ts";

/** POST /api/video/info — real metadata and downloadable options for a link. */
export const POST = apiRoute(
  async ({ request, session }) => {
    enforceRateLimit("analyze", clientKey(request, session.id), getConfig().rateLimitAnalyzePerMinute);
    const { url } = videoInfoRequestSchema.parse(await readJsonBody(request));
    const info = await analyzeVideo(url, session.id);
    return jsonResponse(info);
  },
  { mutating: true },
);
