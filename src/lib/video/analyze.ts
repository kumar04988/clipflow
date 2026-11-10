// "Analyze" = validate the link, ask yt-dlp for the real metadata and formats, build the options.

import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { MediaItem, VideoInfo } from "../../types/index.ts";
import { validateUrl } from "../shared/url.ts";
import { detectPlatform, platformFromExtractor } from "../shared/platforms.ts";
import { getConfig } from "../server/config.ts";
import { getState } from "../server/state.ts";
import { AppError } from "../server/errors.ts";
import { BlockedDestinationError, DnsLookupError, resolvePublicAddress } from "../security/resolve.ts";
import { baseYtDlpArgs, getEngineCapabilities, runYtDlp } from "./engine.ts";
import { buildQualityOptions, defaultOptionId, hasVideo, isUsableFormat, toPublicOption, type EngineFormat, type InternalOption } from "./formats.ts";
import { mapEngineError } from "./errors.ts";
import type { CachedAnalysis, CachedMedia } from "./types.ts";

export const ANALYSIS_TTL_MS = 30 * 60_000;
const MAX_CACHED_ANALYSES = 500;
const MAX_WAITING_ANALYSES = 20;
const PREVIEW_MIN_WIDTH = 320;

const thumbnailSchema = z.looseObject({ url: z.string().nullish(), preference: z.number().nullish(), width: z.number().nullish() });

// Only the fields we use; everything else in yt-dlp's (large) JSON is ignored.
const infoSchema = z.looseObject({
  _type: z.string().optional(),
  title: z.string().nullish(),
  fulltitle: z.string().nullish(),
  uploader: z.string().nullish(),
  channel: z.string().nullish(),
  creator: z.string().nullish(),
  duration: z.number().nullish(),
  thumbnail: z.string().nullish(),
  thumbnails: z.array(thumbnailSchema).nullish(),
  extractor_key: z.string().nullish(),
  is_live: z.boolean().nullish(),
  live_status: z.string().nullish(),
  formats: z.array(z.looseObject({})).nullish(),
  format_id: z.string().nullish(),
  url: z.string().nullish(),
  playlist_index: z.number().nullish(),
  // Failed entries are null.
  entries: z.array(z.looseObject({}).nullable()).nullish(),
});

type EngineInfo = z.infer<typeof infoSchema>;

/** Limits how many yt-dlp analyses run at once; extra requests wait briefly in line. */
async function acquireSlot(): Promise<() => void> {
  const slots = getState().analysisSlots;
  const limit = getConfig().maxConcurrentAnalyses;
  if (slots.active >= limit) {
    if (slots.waiting.length >= MAX_WAITING_ANALYSES) {
      throw new AppError("busy", "The server is busy analyzing other videos. Please try again in a moment.", 503, { "Retry-After": "10" });
    }
    await new Promise<void>((resolve) => slots.waiting.push(resolve));
  }
  slots.active += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    slots.active -= 1;
    slots.waiting.shift()?.();
  };
}

function toHttpsUrl(candidate: string | null | undefined): string | null {
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    url.protocol = "https:";
    return url.href;
  } catch {
    return null;
  }
}

function pickThumbnail(info: EngineInfo): string | null {
  const candidates = [info.thumbnail, ...[...(info.thumbnails ?? [])].sort((a, b) => (b.preference ?? 0) - (a.preference ?? 0) || (b.width ?? 0) - (a.width ?? 0)).map((thumb) => thumb.url)];
  for (const candidate of candidates) {
    const url = toHttpsUrl(candidate);
    if (url) return url;
  }
  return null;
}

/** Width of a thumbnail; Instagram's CDN leaves it out but puts the size in the URL (e.g. "_p480x480_"). */
function thumbnailWidth(thumb: z.infer<typeof thumbnailSchema>): number | null {
  if (thumb.width) return thumb.width;
  const hint = /_[ps](\d{2,4})x\d{2,4}[_&]/.exec(thumb.url ?? "");
  return hint ? Number(hint[1]) : null;
}

/** The smallest thumbnail that still looks sharp in a grid tile; full-size photos are megabytes each. */
function pickPreview(info: EngineInfo): string | null {
  const sized = (info.thumbnails ?? [])
    .map((thumb) => ({ url: toHttpsUrl(thumb.url), width: thumbnailWidth(thumb) }))
    .filter((thumb): thumb is { url: string; width: number } => Boolean(thumb.url) && (thumb.width ?? 0) >= PREVIEW_MIN_WIDTH)
    .sort((a, b) => a.width - b.width);
  return sized[0]?.url ?? pickThumbnail(info);
}

function toMediaItem(info: EngineInfo, fallbackIndex: number): MediaItem | null {
  const formats = (info.formats ?? []) as EngineFormat[];
  const isVideo = formats.some((format) => isUsableFormat(format) && hasVideo(format));
  if (!isVideo && !pickThumbnail(info)) return null;
  return {
    index: info.playlist_index ?? fallbackIndex,
    kind: isVideo ? "video" : "photo",
    thumbnail: pickPreview(info),
    duration: isVideo && typeof info.duration === "number" && info.duration > 0 ? info.duration : null,
  };
}

/**
 * Instagram posts ("/p/ID", also "/username/p/ID") can hold photos, alone or mixed with videos.
 * Reels and IGTV are always videos, so they keep yt-dlp's normal errors (e.g. "login required").
 */
function isPhotoPostUrl(url: string): boolean {
  return detectPlatform(url).id === "instagram" && /^\/(?:[^/]+\/)?p\//.test(new URL(url).pathname);
}

/** A carousel (several photos/videos) or a single-photo post. Null for an ordinary video. */
function extractMedia(info: EngineInfo): CachedMedia | null {
  if (info._type === "playlist") {
    const items = (info.entries ?? []).flatMap((entry, position) => {
      const parsed = entry ? infoSchema.safeParse(entry) : null;
      const item = parsed?.success ? toMediaItem(parsed.data, position + 1) : null;
      return item ? [item] : [];
    });
    if (items.length === 0) throw new AppError("no_media", "This post has no photos or videos that can be downloaded.", 422);
    return { items, playlist: true };
  }
  const item = toMediaItem(info, 1);
  return item?.kind === "photo" ? { items: [{ ...item, index: 1 }], playlist: false } : null;
}

function pruneAnalyses(): void {
  const analyses = getState().analyses;
  const now = Date.now();
  for (const [id, analysis] of analyses) if (now - analysis.createdAt > ANALYSIS_TTL_MS) analyses.delete(id);
  while (analyses.size > MAX_CACHED_ANALYSES) analyses.delete(analyses.keys().next().value as string);
}

export function getCachedAnalysis(sessionId: string, analysisId: string): CachedAnalysis | null {
  const analysis = getState().analyses.get(analysisId);
  if (!analysis || analysis.sessionId !== sessionId || Date.now() - analysis.createdAt > ANALYSIS_TTL_MS) return null;
  return analysis;
}

export async function analyzeVideo(rawUrl: string, sessionId: string): Promise<VideoInfo> {
  const config = getConfig();
  const validation = validateUrl(rawUrl);
  if (!validation.ok) throw new AppError("invalid_url", validation.error, 400);
  const url = validation.url;

  // Quick check before starting yt-dlp; the egress proxy enforces this again for every request it makes.
  try {
    await resolvePublicAddress(new URL(url).hostname);
  } catch (error) {
    if (error instanceof BlockedDestinationError) {
      throw new AppError("blocked_destination", "This link points to a private or internal network address, which isn’t allowed.", 400);
    }
    if (error instanceof DnsLookupError) throw new AppError("host_not_found", "That website couldn’t be found. Check the link for typos.", 400);
    throw error;
  }

  const capabilities = await getEngineCapabilities();
  if (!capabilities.ytDlpVersion) throw new AppError("engine_unavailable", capabilities.problem ?? "The download engine isn’t available.", 503);

  const release = await acquireSlot();
  let stdout: string;
  try {
    // --flat-playlist: a playlist/channel link is reported in seconds (it's rejected below) instead of opening every video.
    const args = [...(await baseYtDlpArgs()), "--dump-single-json", "--skip-download", "--flat-playlist", "--no-warnings"];
    // Without this flag one photo makes the whole post fail.
    if (isPhotoPostUrl(url)) args.push("--ignore-no-formats-error");
    args.push("--", url);
    const result = await runYtDlp(args, {
      timeoutMs: config.analysisTimeoutMs,
      collectStdout: true,
      maxStdoutBytes: 48 * 1024 * 1024,
    }).done;
    if (result.timedOut) throw new AppError("analysis_timeout", "The platform took too long to respond. Please try again.", 504);
    if (result.outputTooLarge) throw new AppError("engine_error", "The platform returned more data than this server accepts.", 502);
    if (result.code !== 0) {
      const mapped = mapEngineError(result.stderrTail);
      throw new AppError(mapped.code, mapped.message, mapped.status);
    }
    stdout = result.stdout;
  } finally {
    release();
  }

  let info: EngineInfo;
  try {
    info = infoSchema.parse(JSON.parse(stdout));
  } catch {
    throw new AppError("engine_error", "The engine returned data that couldn’t be read. Please try again.", 502);
  }

  const media = isPhotoPostUrl(url) ? extractMedia(info) : null;
  if (!media && (info._type === "playlist" || info._type === "multi_video")) {
    throw new AppError("playlist", "This link is a playlist, channel or profile. Paste a link to a single video.", 422);
  }
  if (info.is_live || info.live_status === "is_live" || info.live_status === "is_upcoming") {
    throw new AppError("live_stream", "Live streams and upcoming premieres can’t be downloaded.", 422);
  }

  const duration = typeof info.duration === "number" && info.duration > 0 ? info.duration : null;
  // Some extractors describe a single file at the top level instead of a "formats" list.
  const formats = media ? [] : ((info.formats ?? (info.url && info.format_id ? [info] : [])) as EngineFormat[]);
  let options: InternalOption[] = buildQualityOptions(formats, {
    duration,
    ffmpegAvailable: capabilities.ffmpeg,
    maxFileSizeBytes: config.maxFileSizeBytes,
    streamMergedDownloads: config.streamMergedDownloads,
  });

  let blockedReason: string | null = null;
  if (duration && duration > config.maxDurationSeconds) {
    blockedReason = `Videos longer than ${Math.round(config.maxDurationSeconds / 60)} minutes can’t be downloaded on this server.`;
    options = options.map((option) => ({ ...option, available: false, unavailableReason: blockedReason }));
  }

  const platform = platformFromExtractor(info.extractor_key, url);
  const title = (info.title ?? info.fulltitle ?? "").trim() || "Untitled video";
  const analysis: CachedAnalysis = {
    id: randomUUID(),
    sessionId,
    url,
    title,
    platform,
    duration,
    options,
    media,
    createdAt: Date.now(),
  };
  pruneAnalyses();
  getState().analyses.set(analysis.id, analysis);

  const publicOptions = options.map(toPublicOption);
  return {
    analysisId: analysis.id,
    url,
    platform,
    title,
    uploader: info.uploader ?? info.channel ?? info.creator ?? null,
    duration,
    thumbnail: pickThumbnail(info) ?? media?.items.find((item) => item.thumbnail)?.thumbnail ?? null,
    options: publicOptions,
    defaultOptionId: defaultOptionId(publicOptions),
    blockedReason,
    media: media?.items ?? null,
    expiresAt: new Date(analysis.createdAt + ANALYSIS_TTL_MS).toISOString(),
  };
}
