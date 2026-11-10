import type { HistoryEntry } from "../../types/index.ts";
import type { StoredHistoryEntry } from "../storage/historyStore.ts";
import { availableFileUrl, getJob } from "../jobs/jobManager.ts";

/** Adds live information (is the file still on the server?) and removes the session id. */
export function toPublicHistoryEntry(entry: StoredHistoryEntry, sessionId: string): HistoryEntry {
  const { sessionId: _sessionId, ...rest } = entry;
  const job = getJob(sessionId, entry.id);
  const fileUrl = availableFileUrl(sessionId, entry.id);
  return {
    ...rest,
    status: job?.status ?? entry.status,
    fileAvailable: fileUrl !== null,
    fileUrl,
  };
}
