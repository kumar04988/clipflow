import { apiRoute, jsonResponse } from "@/lib/api/handler.ts";
import { toPublicHistoryEntry } from "@/lib/api/history.ts";
import { activeJobIds, expireJob, getJob } from "@/lib/jobs/jobManager.ts";
import { clearHistory, listHistory } from "@/lib/storage/historyStore.ts";

/** GET /api/history — this browser's downloads, newest first. */
export const GET = apiRoute(async ({ session }) => {
  const entries = listHistory(session.id).map((entry) => toPublicHistoryEntry(entry, session.id));
  return jsonResponse({ entries });
});

/** DELETE /api/history — clears finished entries and deletes their files. Running downloads are kept. */
export const DELETE = apiRoute(
  async ({ session }) => {
    const active = activeJobIds(session.id);
    for (const entry of listHistory(session.id)) {
      const job = getJob(session.id, entry.id);
      if (job) await expireJob(job);
    }
    const removed = clearHistory(session.id, active);
    return jsonResponse({ removed, keptActive: active.size });
  },
  { mutating: true },
);
