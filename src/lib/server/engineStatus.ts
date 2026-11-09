import type { EngineStatus } from "../../types/index.ts";
import { getConfig } from "./config.ts";
import { getEngineCapabilities } from "../video/engine.ts";

export async function getEngineStatus(): Promise<EngineStatus> {
  const config = getConfig();
  const capabilities = await getEngineCapabilities();
  return {
    ready: Boolean(capabilities.ytDlpVersion),
    ytDlpVersion: capabilities.ytDlpVersion,
    ffmpeg: capabilities.ffmpeg,
    message: capabilities.problem,
    limits: {
      maxFileSizeMb: config.maxFileSizeMb,
      maxDurationMinutes: Math.round(config.maxDurationSeconds / 60),
      fileTtlMinutes: Math.round(config.fileTtlMs / 60_000),
    },
  };
}
