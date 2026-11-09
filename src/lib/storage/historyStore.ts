// Download history persisted to DATA_DIR/history.json, scoped by session.
// Writes are debounced and atomic (write temp file → rename) so a crash can't leave half a file.

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { JobStatus, PlatformInfo, SizeEstimate } from "../../types/index.ts";
import { getConfig } from "../server/config.ts";

export interface StoredHistoryEntry {
  id: string;
  sessionId: string;
  title: string;
  platform: PlatformInfo;
  url: string;
  optionId: string;
  quality: string;
  format: string;
  size: SizeEstimate | null;
  status: JobStatus;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  fileName: string | null;
  expiresAt: string | null;
  delivered: boolean;
}

const MAX_ENTRIES_PER_SESSION = 100;
const MAX_ENTRIES_TOTAL = 10_000;

const entrySchema = z.object({
  id: z.uuid(),
  sessionId: z.string().min(1).max(64),
  title: z.string().max(500),
  platform: z.object({ id: z.enum(["youtube", "instagram", "facebook", "x", "tiktok", "vimeo", "other"]), name: z.string().max(100) }),
  url: z.string().max(4096),
  optionId: z.string().max(40),
  quality: z.string().max(80),
  format: z.string().max(20),
  size: z.object({ bytes: z.number().nonnegative(), exact: z.boolean() }).nullable(),
  status: z.enum(["queued", "preparing", "downloading", "merging", "converting", "finalizing", "ready", "failed", "cancelled", "expired"]),
  error: z.string().max(500).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  fileName: z.string().max(300).nullable(),
  expiresAt: z.string().nullable(),
  delivered: z.boolean(),
});

interface Store {
  entries: StoredHistoryEntry[];
  saveTimer: NodeJS.Timeout | null;
  writeChain: Promise<void>;
}

const KEY = Symbol.for("clipflow.history-store");

function historyFile(): string {
  return path.join(getConfig().dataDir, "history.json");
}

function loadFromDisk(): StoredHistoryEntry[] {
  const file = historyFile();
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.warn("[clipflow] Could not read history file.", (error as Error).message);
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as { entries?: unknown };
    if (!Array.isArray(parsed.entries)) throw new Error("missing entries array");
    const valid = parsed.entries.flatMap((entry) => {
      const result = entrySchema.safeParse(entry);
      return result.success ? [result.data as StoredHistoryEntry] : [];
    });
    if (valid.length !== parsed.entries.length) {
      console.warn(`[clipflow] Ignored ${parsed.entries.length - valid.length} invalid history entries.`);
    }
    return valid;
  } catch (error) {
    // Keep the broken file for inspection and start fresh instead of crashing.
    const backup = `${file}.corrupt-${Date.now()}`;
    try {
      fs.renameSync(file, backup);
    } catch {
      // Ignore: the file may have been removed meanwhile.
    }
    console.warn(`[clipflow] History file was unreadable (${(error as Error).message}); moved to ${path.basename(backup)}.`);
    return [];
  }
}

function getStore(): Store {
  const store = globalThis as typeof globalThis & { [KEY]?: Store };
  store[KEY] ??= { entries: loadFromDisk(), saveTimer: null, writeChain: Promise.resolve() };
  return store[KEY];
}

async function writeToDisk(entries: StoredHistoryEntry[]): Promise<void> {
  const file = historyFile();
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(temp, JSON.stringify({ version: 1, entries }), { mode: 0o600 });
  await fsp.rename(temp, file);
}

function scheduleSave(): void {
  const store = getStore();
  if (store.saveTimer) return;
  store.saveTimer = setTimeout(() => {
    store.saveTimer = null;
    const snapshot = [...store.entries];
    store.writeChain = store.writeChain
      .then(() => writeToDisk(snapshot))
      .catch((error: unknown) => console.error("[clipflow] Could not save history.", (error as Error).message));
  }, 250);
  store.saveTimer.unref();
}

export async function flushHistory(): Promise<void> {
  const store = getStore();
  if (store.saveTimer) {
    clearTimeout(store.saveTimer);
    store.saveTimer = null;
    const snapshot = [...store.entries];
    store.writeChain = store.writeChain.then(() => writeToDisk(snapshot));
  }
  await store.writeChain;
}

/** Newest first. */
export function listHistory(sessionId: string): StoredHistoryEntry[] {
  return getStore()
    .entries.filter((entry) => entry.sessionId === sessionId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function upsertHistory(entry: StoredHistoryEntry): void {
  const store = getStore();
  const index = store.entries.findIndex((existing) => existing.id === entry.id);
  if (index === -1) store.entries.push(entry);
  else store.entries[index] = entry;

  const own = listHistory(entry.sessionId);
  if (own.length > MAX_ENTRIES_PER_SESSION) {
    const drop = new Set(own.slice(MAX_ENTRIES_PER_SESSION).map((old) => old.id));
    store.entries = store.entries.filter((existing) => !drop.has(existing.id));
  }
  if (store.entries.length > MAX_ENTRIES_TOTAL) {
    store.entries = store.entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, MAX_ENTRIES_TOTAL);
  }
  scheduleSave();
}

export function removeHistory(sessionId: string, id: string): boolean {
  const store = getStore();
  const before = store.entries.length;
  store.entries = store.entries.filter((entry) => !(entry.sessionId === sessionId && entry.id === id));
  if (store.entries.length !== before) scheduleSave();
  return store.entries.length !== before;
}

/** Removes the session's entries except those in `keep` (active jobs). Returns how many were removed. */
export function clearHistory(sessionId: string, keep: Set<string>): number {
  const store = getStore();
  const before = store.entries.length;
  store.entries = store.entries.filter((entry) => entry.sessionId !== sessionId || keep.has(entry.id));
  if (store.entries.length !== before) scheduleSave();
  return before - store.entries.length;
}

/** Bulk update used at startup (e.g. mark jobs interrupted by a restart). */
export function updateHistoryWhere(
  predicate: (entry: StoredHistoryEntry) => boolean,
  update: (entry: StoredHistoryEntry) => StoredHistoryEntry,
): number {
  const store = getStore();
  let changed = 0;
  store.entries = store.entries.map((entry) => {
    if (!predicate(entry)) return entry;
    changed += 1;
    return update(entry);
  });
  if (changed > 0) scheduleSave();
  return changed;
}
