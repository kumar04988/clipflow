// Server configuration from environment variables (see .env.example). Validated once at startup.

import path from "node:path";
import { z } from "zod";

const booleanFlag = z
  .enum(["true", "false", "1", "0"])
  .transform((value) => value === "true" || value === "1");

const schema = z.object({
  YTDLP_PATH: z.string().min(1).default("yt-dlp"),
  FFMPEG_PATH: z.string().min(1).default("ffmpeg"),
  YTDLP_COOKIES_FILE: z.string().min(1).optional(),
  DATA_DIR: z.string().min(1).default(".data"),
  FILE_TTL_MINUTES: z.coerce.number().int().min(1).max(1440).default(60),
  MAX_FILE_SIZE_MB: z.coerce.number().int().min(1).max(100_000).default(4096),
  MAX_DURATION_MINUTES: z.coerce.number().int().min(1).max(1440).default(240),
  MAX_CONCURRENT_JOBS: z.coerce.number().int().min(1).max(32).default(2),
  MAX_ACTIVE_JOBS_PER_SESSION: z.coerce.number().int().min(1).max(20).default(2),
  MAX_CONCURRENT_ANALYSES: z.coerce.number().int().min(1).max(32).default(4),
  JOB_TIMEOUT_MINUTES: z.coerce.number().int().min(1).max(720).default(30),
  ANALYSIS_TIMEOUT_SECONDS: z.coerce.number().int().min(5).max(300).default(60),
  RATE_LIMIT_ANALYZE_PER_MINUTE: z.coerce.number().int().min(1).max(10_000).default(20),
  RATE_LIMIT_DOWNLOAD_PER_MINUTE: z.coerce.number().int().min(1).max(10_000).default(10),
  TRUST_PROXY: booleanFlag.default(false),
});

export interface AppConfig {
  ytDlpPath: string;
  ffmpegPath: string;
  cookiesFile: string | null;
  dataDir: string;
  jobsDir: string;
  fileTtlMs: number;
  maxFileSizeBytes: number;
  maxFileSizeMb: number;
  maxDurationSeconds: number;
  maxConcurrentJobs: number;
  maxActiveJobsPerSession: number;
  maxConcurrentAnalyses: number;
  jobTimeoutMs: number;
  analysisTimeoutMs: number;
  rateLimitAnalyzePerMinute: number;
  rateLimitDownloadPerMinute: number;
  trustProxy: boolean;
}

let cached: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid ClipFlow configuration — ${problems}`);
  }
  const env = parsed.data;
  const dataDir = path.resolve(/* turbopackIgnore: true */ process.cwd(), env.DATA_DIR);
  cached = {
    ytDlpPath: env.YTDLP_PATH,
    ffmpegPath: env.FFMPEG_PATH,
    cookiesFile: env.YTDLP_COOKIES_FILE ? path.resolve(/* turbopackIgnore: true */ process.cwd(), env.YTDLP_COOKIES_FILE) : null,
    dataDir,
    jobsDir: path.join(dataDir, "jobs"),
    fileTtlMs: env.FILE_TTL_MINUTES * 60_000,
    maxFileSizeBytes: env.MAX_FILE_SIZE_MB * 1024 * 1024,
    maxFileSizeMb: env.MAX_FILE_SIZE_MB,
    maxDurationSeconds: env.MAX_DURATION_MINUTES * 60,
    maxConcurrentJobs: env.MAX_CONCURRENT_JOBS,
    maxActiveJobsPerSession: env.MAX_ACTIVE_JOBS_PER_SESSION,
    maxConcurrentAnalyses: env.MAX_CONCURRENT_ANALYSES,
    jobTimeoutMs: env.JOB_TIMEOUT_MINUTES * 60_000,
    analysisTimeoutMs: env.ANALYSIS_TIMEOUT_SECONDS * 1000,
    rateLimitAnalyzePerMinute: env.RATE_LIMIT_ANALYZE_PER_MINUTE,
    rateLimitDownloadPerMinute: env.RATE_LIMIT_DOWNLOAD_PER_MINUTE,
    trustProxy: env.TRUST_PROXY,
  };
  return cached;
}
