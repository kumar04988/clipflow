// yt-dlp + FFmpeg integration: capability checks and the arguments every run shares.

import path from "node:path";
import { getConfig } from "../server/config.ts";
import { getState, type EngineCapabilities } from "../server/state.ts";
import { runProcess } from "../server/process.ts";
import { startEgressProxy, type EgressProxy } from "../security/egressProxy.ts";

const CAPABILITY_CACHE_MS = 5 * 60_000;

async function checkCapabilities(): Promise<EngineCapabilities> {
  const config = getConfig();
  const ytDlp = await runProcess(config.ytDlpPath, ["--version"], { timeoutMs: 15_000, collectStdout: true }).done;
  const ffmpeg = await runProcess(config.ffmpegPath, ["-hide_banner", "-version"], { timeoutMs: 15_000, collectStdout: true }).done;

  const ytDlpVersion = ytDlp.code === 0 ? ytDlp.stdout.trim().split(/\s+/)[0] || null : null;
  const ffmpegAvailable = ffmpeg.code === 0;
  let problem: string | null = null;
  if (!ytDlpVersion) {
    problem = "The download engine (yt-dlp) isn’t installed on this server, so videos can’t be analyzed or downloaded here.";
  } else if (!ffmpegAvailable) {
    problem = "FFmpeg isn’t installed on this server, so only formats that need no merging or conversion are offered.";
  }
  return { ytDlpVersion, ffmpeg: ffmpegAvailable, problem };
}

/** Cached for a few minutes so a missing tool can be installed without restarting. */
export function getEngineCapabilities(): Promise<EngineCapabilities> {
  const state = getState();
  const now = Date.now();
  if (!state.capabilities || now - state.capabilities.checkedAt > CAPABILITY_CACHE_MS) {
    state.capabilities = { value: checkCapabilities(), checkedAt: now };
  }
  return state.capabilities.value;
}

export function getEgressProxy(): Promise<EgressProxy> {
  const state = getState();
  state.proxy ??= startEgressProxy().catch((error: unknown) => {
    state.proxy = null;
    throw error;
  });
  return state.proxy;
}

/** Options shared by analysis and download runs. The user's URL is always added after "--". */
export async function baseYtDlpArgs(): Promise<string[]> {
  const config = getConfig();
  const proxy = await getEgressProxy();
  const args = [
    "--ignore-config",
    "--no-playlist",
    "--socket-timeout",
    "20",
    "--retries",
    "3",
    "--fragment-retries",
    "3",
    "--cache-dir",
    path.join(config.dataDir, "cache", "yt-dlp"),
    "--proxy",
    proxy.url,
  ];
  if (config.cookiesFile) args.push("--cookies", config.cookiesFile);
  if (config.ffmpegPath !== "ffmpeg") args.push("--ffmpeg-location", config.ffmpegPath);
  return args;
}
