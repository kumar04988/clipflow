import { connection } from "next/server";
import { jsonResponse } from "@/lib/api/handler.ts";
import { getEngineStatus } from "@/lib/server/engineStatus.ts";

/** GET /api/health — is the download engine installed? Used by the UI and for uptime checks. */
export async function GET() {
  // Always evaluate at request time (never prerender this at build time).
  await connection();
  const status = await getEngineStatus();
  return jsonResponse(status, status.ready ? 200 : 503);
}
