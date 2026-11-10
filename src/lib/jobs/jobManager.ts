// Download jobs: queue → yt-dlp download (+ FFmpeg merge/convert) → file ready → expiry.
// Jobs run in this Node process, so ClipFlow must be deployed as a long-running server, not serverless.

import fsp from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { JobStatus, JobView, MediaItem } from "../../types/index.ts";
import { isActiveStatus } from "../../types/index.ts";
import { getConfig } from "../server/config.ts";
import { getState } from "../server/state.ts";
import { AppError } from "../server/errors.ts";
import { terminateProcessTree } from "../server/process.ts";
import { baseYtDlpArgs, getEngineCapabilities, removeCookieCopies, runYtDlp } from "../video/engine.ts";
import { getCachedAnalysis } from "../video/analyze.ts";
import { mapEngineError } from "../video/errors.ts";
import type { InternalOption } from "../video/formats.ts";
import type { CachedAnalysis } from "../video/types.ts";
import { describeOption } from "../shared/quality.ts";
import { describeMediaCounts } from "../shared/media.ts";
import { buildDownloadFileName, qualityTag } from "../download/filename.ts";
import { upsertHistory, updateHistoryWhere, type StoredHistoryEntry } from "../storage/historyStore.ts";
import { computeOverallProgress, FILE_PREFIX, parseProgressLine, PROGRESS_TEMPLATE } from "./progress.ts";
import type { Job, JobFile, MediaJob } from "./types.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FINISHED_JOB_MEMORY_MS = 6 * 60 * 60_000;
const CLEANUP_INTERVAL_MS = 60_000;
const OUTPUT_BASENAME = "media";
const MEDIA_OPTION_ID = "media";
// yt-dlp also saves each video's cover image; it gets this suffix so it is never mistaken for a photo.
const COVER_SUFFIX = "-cover";
const ITEM_LINE = /^\[download\] Downloading item (\d+) of \d+/;
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "heic", "avif"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mkv", "mov", "m4v"]);

export function isJobId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function phaseFor(job: Job): string {
  switch (job.status) {
    case "queued": {
      const position = getState().queue.indexOf(job.id) + 1;
      return position > 1 ? `Waiting in line (position ${position})` : "Waiting for a free processing slot";
    }
    case "preparing":
      return job.media ? "Reading the post" : "Preparing the selected format";
    case "downloading": {
      if (job.media) return job.media.current > 0 ? `Downloading item ${job.media.current} of ${job.media.items.length}` : "Reading the post";
      if (job.parts.length < 2) return job.option.kind === "audio" ? "Downloading audio" : "Downloading media";
      const active = job.parts.findIndex((part) => !part.done);
      return active <= 0 ? "Downloading video stream" : "Downloading audio stream";
    }
    case "merging":
      return "Merging video and audio";
    case "converting":
      return "Converting to MP3";
    case "finalizing":
      return "Preparing your file";
    case "ready":
      return "Ready to save";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    case "expired":
      return "File expired";
  }
}

function historyRecord(job: Job): StoredHistoryEntry {
  return {
    id: job.id,
    sessionId: job.sessionId,
    title: job.title,
    platform: job.platform,
    url: job.url,
    optionId: job.option.id,
    quality: describeOption(job.option),
    format: job.option.container.toUpperCase(),
    size: job.fileSize ? { bytes: job.fileSize, exact: true } : job.option.size,
    status: job.status,
    error: job.error?.message ?? null,
    createdAt: new Date(job.createdAt).toISOString(),
    updatedAt: new Date(job.updatedAt).toISOString(),
    fileName: job.fileName,
    expiresAt: job.expiresAt ? new Date(job.expiresAt).toISOString() : null,
    delivered: job.delivered,
  };
}

function setStatus(job: Job, status: JobStatus): void {
  const changed = job.status !== status;
  job.status = status;
  job.phase = phaseFor(job);
  job.updatedAt = Date.now();
  if (changed) upsertHistory(historyRecord(job));
}

async function removeJobDir(job: Job): Promise<void> {
  const root = path.resolve(getConfig().jobsDir);
  const dir = path.resolve(job.dir);
  // Only ever delete our own per-job folders.
  if (path.dirname(dir) !== root || !isJobId(path.basename(dir))) return;
  await fsp.rm(dir, { recursive: true, force: true }).catch(() => undefined);
}

function fail(job: Job, code: string, message: string): void {
  job.error = { code, message };
  job.progress = null;
  job.speed = null;
  job.eta = null;
  job.finishedAt = Date.now();
  setStatus(job, "failed");
  void removeJobDir(job);
}

function fileUrl(job: Job, file?: JobFile): string {
  return `/api/download/${job.id}/file${file ? `?item=${file.item.index}` : ""}`;
}

export function toJobView(job: Job): JobView {
  return {
    id: job.id,
    analysisId: job.analysisId,
    optionId: job.option.id,
    status: job.status,
    phase: phaseFor(job),
    progress: job.progress,
    downloadedBytes: job.downloadedBytes,
    totalBytes: job.totalBytes,
    speed: job.speed,
    eta: job.eta,
    queuePosition: job.status === "queued" ? getState().queue.indexOf(job.id) + 1 : null,
    title: job.title,
    quality: describeOption(job.option),
    format: job.option.container.toUpperCase(),
    fileName: job.fileName,
    fileSize: job.fileSize,
    fileUrl: job.status === "ready" && job.filePath ? fileUrl(job) : null,
    files:
      job.status === "ready" && job.files
        ? job.files.map((file) => ({
            index: file.item.index,
            kind: file.item.kind,
            fileName: file.name,
            fileSize: file.size,
            fileUrl: fileUrl(job, file),
            delivered: file.delivered,
          }))
        : null,
    expiresAt: job.expiresAt ? new Date(job.expiresAt).toISOString() : null,
    delivered: job.delivered,
    error: job.error,
    createdAt: new Date(job.createdAt).toISOString(),
    updatedAt: new Date(job.updatedAt).toISOString(),
  };
}

/** Only the session that created a job can see it. Unknown and foreign jobs look the same (404). */
export function getJob(sessionId: string, jobId: string): Job | null {
  if (!isJobId(jobId)) return null;
  const job = getState().jobs.get(jobId);
  return job && job.sessionId === sessionId ? job : null;
}

export function activeJobIds(sessionId: string): Set<string> {
  return new Set([...getState().jobs.values()].filter((job) => job.sessionId === sessionId && isActiveStatus(job.status)).map((job) => job.id));
}

function requireAnalysis(sessionId: string, analysisId: string): CachedAnalysis {
  const analysis = getCachedAnalysis(sessionId, analysisId);
  if (!analysis) {
    throw new AppError("analysis_expired", "This analysis has expired. Analyze the link again to see the current formats.", 410);
  }
  return analysis;
}

const mediaKey = (media: MediaJob | null) => media?.items.map((item) => item.index).join(",") ?? "";

/** "mp4 + jpg" — the formats of a media download, shown in progress and history. */
function joinExtensions(extensions: string[]): string {
  return [...new Set(extensions)].join(" + ");
}

/** Describes a media download in the same shape as a quality option, so progress and history work unchanged. */
function mediaOption(items: MediaItem[]): InternalOption {
  return {
    id: MEDIA_OPTION_ID,
    kind: "video",
    label: describeMediaCounts(items),
    badge: null,
    height: null,
    fps: null,
    hdr: false,
    container: joinExtensions(items.map((item) => (item.kind === "video" ? "mp4" : "jpg"))),
    videoCodec: null,
    audioCodec: null,
    hasAudio: null,
    requiresMerge: false,
    reencodes: false,
    size: null,
    compatibility: "universal",
    compatibilityNote: "",
    available: true,
    unavailableReason: null,
    streamable: false,
    selector: "",
    mergeFormat: null,
    extractAudio: null,
    parts: [],
  };
}

export async function createJob(sessionId: string, analysisId: string, optionId: string): Promise<{ job: Job; existing: boolean }> {
  const analysis = requireAnalysis(sessionId, analysisId);
  const option = analysis.options.find((candidate) => candidate.id === optionId);
  if (!option) throw new AppError("invalid_option", "That quality isn’t available for this video.", 400);
  if (!option.available) throw new AppError("option_unavailable", option.unavailableReason ?? "That quality can’t be downloaded.", 400);
  return enqueueJob(sessionId, analysis, option, null);
}

/** Downloads the chosen items of a photo/multi-item post: one item as itself, several as one ZIP. */
export async function createMediaJob(sessionId: string, analysisId: string, indexes: number[]): Promise<{ job: Job; existing: boolean }> {
  const analysis = requireAnalysis(sessionId, analysisId);
  if (!analysis.media) throw new AppError("invalid_option", "This link has no photos or slides to choose from.", 400);
  const wanted = new Set(indexes);
  const items = analysis.media.items.filter((item) => wanted.has(item.index));
  if (items.length !== wanted.size) throw new AppError("invalid_option", "Some of the chosen items aren’t in this post. Analyze the link again.", 400);
  const media: MediaJob = { items, playlist: analysis.media.playlist, current: 0, doneBytes: 0, itemBytes: new Map() };
  return enqueueJob(sessionId, analysis, mediaOption(items), media);
}

function enqueueJob(sessionId: string, analysis: CachedAnalysis, option: InternalOption, media: MediaJob | null): { job: Job; existing: boolean } {
  const config = getConfig();
  const state = getState();
  const sessionJobs = [...state.jobs.values()].filter((job) => job.sessionId === sessionId && isActiveStatus(job.status));
  // A double click (or a resent request) returns the job that is already running.
  const duplicate = sessionJobs.find((job) => job.analysisId === analysis.id && job.option.id === option.id && mediaKey(job.media) === mediaKey(media));
  if (duplicate) return { job: duplicate, existing: true };
  if (sessionJobs.length >= config.maxActiveJobsPerSession) {
    throw new AppError("too_many_jobs", `You can prepare up to ${config.maxActiveJobsPerSession} downloads at a time. Wait for one to finish or cancel it.`, 429);
  }

  const id = randomUUID();
  const now = Date.now();
  const job: Job = {
    id,
    sessionId,
    analysisId: analysis.id,
    url: analysis.url,
    title: analysis.title,
    platform: analysis.platform,
    option,
    media,
    status: "queued",
    phase: "",
    parts: option.parts.map((part) => ({ formatId: part.formatId, expectedSize: part.size, downloaded: 0, total: null, done: false })),
    progress: null,
    downloadedBytes: 0,
    totalBytes: null,
    speed: null,
    eta: null,
    error: null,
    createdAt: now,
    updatedAt: now,
    finishedAt: null,
    expiresAt: null,
    dir: path.join(config.jobsDir, id),
    reportedPath: null,
    filePath: null,
    fileName: null,
    fileSize: null,
    files: null,
    delivered: false,
    child: null,
  };
  job.phase = phaseFor(job);
  state.jobs.set(id, job);
  state.queue.push(id);
  upsertHistory(historyRecord(job));
  pumpQueue();
  return { job, existing: false };
}

function pumpQueue(): void {
  const state = getState();
  const limit = getConfig().maxConcurrentJobs;
  while (state.running.size < limit && state.queue.length > 0) {
    const job = state.jobs.get(state.queue.shift()!);
    if (!job || job.status !== "queued") continue;
    state.running.add(job.id);
    void runJob(job).finally(() => {
      state.running.delete(job.id);
      pumpQueue();
    });
  }
}

function handleMediaLine(job: Job, media: MediaJob, line: string): void {
  const item = ITEM_LINE.exec(line);
  if (item) {
    for (const bytes of media.itemBytes.values()) media.doneBytes += bytes;
    media.itemBytes.clear();
    media.current = Math.min(Number(item[1]), media.items.length);
    job.progress = Math.floor(((media.current - 1) / media.items.length) * 100);
    job.downloadedBytes = media.doneBytes;
    setStatus(job, "downloading");
    return;
  }
  const progress = parseProgressLine(line);
  if (!progress || progress.downloaded === null) return;
  media.itemBytes.set(progress.formatId, progress.downloaded);
  job.downloadedBytes = media.doneBytes + [...media.itemBytes.values()].reduce((sum, bytes) => sum + bytes, 0);
  job.speed = progress.speed;
  setStatus(job, "downloading");
}

function handleOutputLine(job: Job, line: string): void {
  if (isCancelled(job)) return;
  if (job.media) {
    handleMediaLine(job, job.media, line);
    return;
  }
  if (line.startsWith(FILE_PREFIX)) {
    job.reportedPath = line.slice(FILE_PREFIX.length).trim();
    return;
  }
  const progress = parseProgressLine(line);
  if (!progress) return;

  let part = job.parts.find((candidate) => candidate.formatId === progress.formatId);
  if (!part) {
    part = { formatId: progress.formatId, expectedSize: null, downloaded: 0, total: null, done: false };
    job.parts.push(part);
  }
  if (progress.downloaded !== null) part.downloaded = progress.downloaded;
  if (progress.total !== null) part.total = progress.total;
  if (progress.status === "finished") part.done = true;

  const overall = computeOverallProgress(job.parts);
  job.downloadedBytes = overall.downloadedBytes;
  job.totalBytes = overall.totalBytes;

  if (job.parts.every((candidate) => candidate.done)) {
    // Downloading is done; merging/converting has no real percentage, so show it as indeterminate.
    job.progress = null;
    job.speed = null;
    job.eta = null;
    setStatus(job, job.option.mergeFormat ? "merging" : job.option.extractAudio ? "converting" : "finalizing");
  } else {
    job.progress = overall.percent;
    job.speed = progress.speed;
    job.eta = progress.eta;
    setStatus(job, "downloading");
  }
}

/** Finds the output file, making sure it really is inside this job's folder. */
async function locateOutput(job: Job): Promise<string | null> {
  const dir = path.resolve(job.dir);
  const isInside = (candidate: string) => path.dirname(path.resolve(candidate)) === dir;
  if (job.reportedPath && isInside(job.reportedPath)) {
    const stat = await fsp.stat(job.reportedPath).catch(() => null);
    if (stat?.isFile()) return path.resolve(job.reportedPath);
  }
  const names = await fsp.readdir(dir).catch(() => [] as string[]);
  const media = names.filter((name) => name.startsWith(`${OUTPUT_BASENAME}.`) && !/\.(part|ytdl|temp|tmp)$/.test(name) && !/\.f\d+\./.test(name));
  return media.length === 1 ? path.join(dir, media[0]) : null;
}

const itemFileBase = (index: number) => String(index).padStart(3, "0");

/** The downloaded file of every chosen item (each is saved separately), or null if any is missing or empty. */
async function collectMediaFiles(job: Job, media: MediaJob): Promise<JobFile[] | null> {
  const names = await fsp.readdir(job.dir).catch(() => [] as string[]);
  const files: JobFile[] = [];
  for (const item of media.items) {
    const base = itemFileBase(item.index);
    // A photo is written by yt-dlp's thumbnail step, under either output name.
    const bases = item.kind === "video" ? [base] : [base, `${base}${COVER_SUFFIX}`];
    const allowed = item.kind === "video" ? VIDEO_EXTENSIONS : IMAGE_EXTENSIONS;
    const name = names.find((candidate) => {
      const extension = path.extname(candidate);
      return bases.includes(candidate.slice(0, -extension.length)) && allowed.has(extension.slice(1).toLowerCase());
    });
    if (!name) return null;
    const filePath = path.join(job.dir, name);
    const stat = await fsp.stat(filePath).catch(() => null);
    if (!stat?.size) return null;
    const extension = path.extname(name).slice(1).toLowerCase();
    files.push({ item, path: filePath, name: buildDownloadFileName(job.title, `${item.kind} ${item.index}`, extension), size: stat.size, delivered: false });
  }
  return files;
}

function optionDownloadArgs(job: Job): string[] {
  const option = job.option;
  const args = [
    "--format",
    option.selector,
    "--print",
    `after_move:${FILE_PREFIX} %(filepath)s`,
    "--output",
    path.join(job.dir, `${OUTPUT_BASENAME}.%(ext)s`),
    "--no-write-thumbnail",
  ];
  if (option.mergeFormat) args.push("--merge-output-format", option.mergeFormat);
  if (option.extractAudio) args.push("--extract-audio", "--audio-format", option.extractAudio, "--audio-quality", "0");
  return args;
}

/**
 * Photos have no media formats: yt-dlp reports "No video formats found" for them (so it exits with an
 * error) and saves the photo through its thumbnail step. Success is therefore judged by the files written.
 */
function mediaDownloadArgs(job: Job, media: MediaJob, ffmpeg: boolean): string[] {
  const name = media.playlist ? "%(playlist_index)03d" : itemFileBase(1);
  const args = [
    "--ignore-errors",
    "--ignore-no-formats-error",
    "--format",
    ffmpeg ? "bv*+ba/b" : "b",
    "--write-thumbnail",
    "--output",
    path.join(job.dir, `${name}.%(ext)s`),
    "--output",
    `thumbnail:${path.join(job.dir, `${name}${COVER_SUFFIX}.%(ext)s`)}`,
  ];
  if (ffmpeg) args.push("--merge-output-format", "mp4");
  if (media.playlist) args.push("--yes-playlist", "--playlist-items", media.items.map((item) => item.index).join(","));
  return args;
}

/** Read through a function: a cancel request can change the status while this job is awaiting. */
function isCancelled(job: Job): boolean {
  return job.status === "cancelled";
}

async function runJob(job: Job): Promise<void> {
  const config = getConfig();
  if (job.status !== "queued") return;
  setStatus(job, "preparing");

  try {
    await fsp.mkdir(job.dir, { recursive: true, mode: 0o700 });
    const args = [
      ...(await baseYtDlpArgs()),
      "--newline",
      "--progress",
      "--progress-delta",
      "0.5",
      "--progress-template",
      PROGRESS_TEMPLATE,
      "--max-filesize",
      `${config.maxFileSizeMb}M`,
      "--concurrent-fragments",
      "4",
      "--no-mtime",
      "--no-embed-metadata",
      ...(job.media ? mediaDownloadArgs(job, job.media, (await getEngineCapabilities()).ffmpeg) : optionDownloadArgs(job)),
      "--",
      job.url,
    ];

    if (isCancelled(job)) {
      await removeJobDir(job);
      return;
    }
    const running = runYtDlp(args, {
      timeoutMs: config.jobTimeoutMs,
      onLine: (line, stream) => {
        if (stream === "stdout") handleOutputLine(job, line);
      },
    });
    job.child = running.child;
    const result = await running.done;
    job.child = null;

    if (isCancelled(job)) {
      await removeJobDir(job);
      return;
    }
    if (result.timedOut) {
      fail(job, "timeout", "Processing took too long and was stopped. Try a lower quality.");
      return;
    }

    const files = job.media ? await collectMediaFiles(job, job.media) : null;
    const filePath = !job.media && result.code === 0 ? await locateOutput(job) : null;
    if (isCancelled(job)) {
      await removeJobDir(job);
      return;
    }
    if (!files && !filePath && result.code !== 0) {
      const mapped = mapEngineError(result.stderrTail);
      fail(job, mapped.code, mapped.message);
      return;
    }
    const size = files ? files.reduce((sum, file) => sum + file.size, 0) : ((filePath ? await fsp.stat(filePath).catch(() => null) : null)?.size ?? 0);
    if (size === 0) {
      fail(job, "output_missing", job.media ? "Some of the chosen items couldn’t be downloaded. Try again or choose fewer items." : "The download finished but no file was produced. Try another quality.");
      return;
    }

    if (files) {
      job.files = files;
      job.option = { ...job.option, container: joinExtensions(files.map((file) => path.extname(file.name).slice(1))) };
    } else if (filePath) {
      job.filePath = filePath;
      job.fileName = buildDownloadFileName(job.title, qualityTag(job.option), path.extname(filePath).slice(1));
    }
    job.fileSize = size;
    job.progress = 100;
    job.downloadedBytes = size;
    job.totalBytes = size;
    job.speed = null;
    job.eta = null;
    job.finishedAt = Date.now();
    job.expiresAt = job.finishedAt + config.fileTtlMs;
    setStatus(job, "ready");
  } catch (error) {
    if (isCancelled(job)) return;
    if (error instanceof AppError) {
      fail(job, error.code, error.message);
      return;
    }
    console.error(`[clipflow] Job ${job.id} crashed:`, (error as Error).message);
    fail(job, "internal_error", "Something went wrong while preparing the file. Please try again.");
  }
}

export async function cancelJob(sessionId: string, jobId: string): Promise<Job> {
  const job = getJob(sessionId, jobId);
  if (!job) throw new AppError("not_found", "Download not found.", 404);
  if (!isActiveStatus(job.status)) return job;

  const state = getState();
  state.queue = state.queue.filter((id) => id !== job.id);
  job.progress = null;
  job.speed = null;
  job.eta = null;
  job.finishedAt = Date.now();
  setStatus(job, "cancelled");
  if (job.child) terminateProcessTree(job.child);
  else await removeJobDir(job);
  return job;
}

/** Called when a whole file was sent; a media job counts as delivered once every file was. */
export function markDelivered(job: Job, file?: JobFile): void {
  if (file) file.delivered = true;
  if (job.delivered || (job.files && !job.files.every((candidate) => candidate.delivered))) return;
  job.delivered = true;
  job.updatedAt = Date.now();
  upsertHistory(historyRecord(job));
}

/** The link that saves a ready job's file, or null (expired, or several separate files to save one by one). */
export function availableFileUrl(sessionId: string, jobId: string): string | null {
  const job = getJob(sessionId, jobId);
  if (!job || job.status !== "ready" || (job.expiresAt ?? 0) <= Date.now()) return null;
  if (job.filePath) return fileUrl(job);
  return job.files?.length === 1 ? fileUrl(job, job.files[0]) : null;
}

export async function expireJob(job: Job): Promise<void> {
  if (job.status !== "ready") return;
  job.filePath = null;
  job.files = null;
  setStatus(job, "expired");
  await removeJobDir(job);
}

async function cleanup(): Promise<void> {
  const state = getState();
  const now = Date.now();
  for (const job of state.jobs.values()) {
    if (job.status === "ready" && (job.expiresAt ?? 0) <= now) await expireJob(job);
    if (!isActiveStatus(job.status) && job.status !== "ready" && job.finishedAt && now - job.finishedAt > FINISHED_JOB_MEMORY_MS) {
      state.jobs.delete(job.id);
    }
  }
  for (const [key, hits] of state.rateBuckets) if (hits.every((time) => now - time > 60_000)) state.rateBuckets.delete(key);
}

/**
 * Runs once per server start: removes leftover files from a previous run, records interrupted
 * jobs in history, and starts the periodic cleanup.
 */
export function ensureJobSystemStarted(): Promise<void> {
  const state = getState();
  state.started ??= (async () => {
    const { jobsDir } = getConfig();
    await fsp.mkdir(jobsDir, { recursive: true, mode: 0o700 });
    await removeCookieCopies();
    const known = new Set(state.jobs.keys());
    for (const name of await fsp.readdir(jobsDir)) {
      if (isJobId(name) && !known.has(name)) await fsp.rm(path.join(jobsDir, name), { recursive: true, force: true });
    }
    const nowIso = new Date().toISOString();
    updateHistoryWhere(
      (entry) => !known.has(entry.id) && isActiveStatus(entry.status),
      (entry) => ({ ...entry, status: "failed", error: "Interrupted because the server restarted.", updatedAt: nowIso }),
    );
    updateHistoryWhere(
      (entry) => !known.has(entry.id) && entry.status === "ready",
      (entry) => ({ ...entry, status: "expired", updatedAt: nowIso }),
    );
    state.cleanupTimer = setInterval(() => void cleanup().catch(() => undefined), CLEANUP_INTERVAL_MS);
    state.cleanupTimer.unref();
  })();
  return state.started;
}
