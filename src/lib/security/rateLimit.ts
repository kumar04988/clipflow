// Small in-memory sliding-window rate limiter (fine for the single-instance deployment ClipFlow targets).

import type { NextRequest } from "next/server";
import { getState } from "../server/state.ts";
import { getConfig } from "../server/config.ts";
import { AppError } from "../server/errors.ts";

const WINDOW_MS = 60_000;
const MAX_TRACKED_KEYS = 20_000;

/** Identifies the client: real IP when behind a trusted proxy, otherwise the session. */
export function clientKey(request: NextRequest, sessionId: string): string {
  if (getConfig().trustProxy) {
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded) return `ip:${forwarded}`;
  }
  return `session:${sessionId}`;
}

export function enforceRateLimit(bucket: string, key: string, limitPerMinute: number): void {
  const buckets = getState().rateBuckets;
  const now = Date.now();
  const id = `${bucket}:${key}`;
  const hits = (buckets.get(id) ?? []).filter((time) => now - time < WINDOW_MS);

  if (hits.length >= limitPerMinute) {
    const retryAfter = Math.max(1, Math.ceil((WINDOW_MS - (now - hits[0])) / 1000));
    throw new AppError("rate_limited", `Too many requests. Please wait ${retryAfter} seconds and try again.`, 429, {
      "Retry-After": String(retryAfter),
    });
  }

  hits.push(now);
  buckets.set(id, hits);
  if (buckets.size > MAX_TRACKED_KEYS) {
    for (const [storedKey, times] of buckets) {
      if (times.every((time) => now - time >= WINDOW_MS)) buckets.delete(storedKey);
    }
  }
}
