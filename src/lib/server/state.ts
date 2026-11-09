// Process-wide state. Stored on globalThis so it survives hot reloads in development.
// ClipFlow keeps jobs in memory, so run ONE server instance (see README → Deployment).

import type { EgressProxy } from "../security/egressProxy.ts";
import type { Job } from "../jobs/types.ts";
import type { CachedAnalysis } from "../video/types.ts";

export interface EngineCapabilities {
  ytDlpVersion: string | null;
  ffmpeg: boolean;
  problem: string | null;
}

interface ServerState {
  jobs: Map<string, Job>;
  queue: string[];
  running: Set<string>;
  /** Streaming downloads in progress: stream id → session id. */
  streams: Map<string, string>;
  analyses: Map<string, CachedAnalysis>;
  rateBuckets: Map<string, number[]>;
  analysisSlots: { active: number; waiting: Array<() => void> };
  proxy: Promise<EgressProxy> | null;
  capabilities: { value: Promise<EngineCapabilities>; checkedAt: number } | null;
  started: Promise<void> | null;
  cleanupTimer: NodeJS.Timeout | null;
}

const KEY = Symbol.for("clipflow.server-state");

export function getState(): ServerState {
  const store = globalThis as typeof globalThis & { [KEY]?: ServerState };
  store[KEY] ??= {
    jobs: new Map(),
    queue: [],
    running: new Set(),
    streams: new Map(),
    analyses: new Map(),
    rateBuckets: new Map(),
    analysisSlots: { active: 0, waiting: [] },
    proxy: null,
    capabilities: null,
    started: null,
    cleanupTimer: null,
  };
  return store[KEY];
}
