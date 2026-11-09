// Turns the raw format list reported by yt-dlp into the options shown to the user.
// Pure functions only (no I/O) so every edge case can be unit-tested.

import type { Compatibility, QualityOption, SizeEstimate } from "../../types/index.ts";
import { resolutionBadge, selectDefaultOption, sortAudioOptions, sortVideoOptions } from "../shared/quality.ts";
import { formatBytes } from "../shared/format.ts";

/** The subset of a yt-dlp format object that we use. Every field may be missing. */
export interface EngineFormat {
  format_id?: string | null;
  ext?: string | null;
  protocol?: string | null;
  vcodec?: string | null;
  acodec?: string | null;
  height?: number | null;
  width?: number | null;
  fps?: number | null;
  filesize?: number | null;
  filesize_approx?: number | null;
  tbr?: number | null;
  abr?: number | null;
  dynamic_range?: string | null;
  has_drm?: boolean | string | null;
  format_note?: string | null;
  language_preference?: number | null;
}

export interface BuildContext {
  duration: number | null;
  ffmpegAvailable: boolean;
  maxFileSizeBytes: number;
}

export interface PlannedPart {
  formatId: string;
  size: number | null;
}

/** Server-side option: the public fields plus exactly how to produce it. Never sent to the browser. */
export interface InternalOption extends QualityOption {
  selector: string;
  mergeFormat: "mp4" | "webm" | null;
  extractAudio: "mp3" | null;
  parts: PlannedPart[];
}

type VideoFamily = "h264" | "hevc" | "av1" | "vp9" | "vp8" | "other" | "unknown";
type AudioFamily = "aac" | "opus" | "vorbis" | "mp3" | "ac3" | "eac3" | "flac" | "other" | "unknown";
type OutputContainer = "mp4" | "webm";

const VIDEO_LABELS: Record<VideoFamily, string | null> = {
  h264: "H.264",
  hevc: "HEVC",
  av1: "AV1",
  vp9: "VP9",
  vp8: "VP8",
  other: "Other",
  unknown: null,
};

const AUDIO_LABELS: Record<AudioFamily, string | null> = {
  aac: "AAC",
  opus: "Opus",
  vorbis: "Vorbis",
  mp3: "MP3",
  ac3: "Dolby AC-3",
  eac3: "Dolby E-AC-3",
  flac: "FLAC",
  other: "Other",
  unknown: null,
};

/** Codecs that can be copied into each container without re-encoding (best first). */
const CONTAINER_CODECS: Record<OutputContainer, { video: VideoFamily[]; audio: AudioFamily[] }> = {
  mp4: { video: ["h264", "av1", "hevc"], audio: ["aac", "mp3", "ac3", "eac3"] },
  webm: { video: ["vp9", "av1", "vp8"], audio: ["opus", "vorbis"] },
};

const VIDEO_EXTENSIONS = new Set(["mp4", "m4v", "mov", "webm", "mkv", "flv", "3gp", "ts"]);
const MP3_VBR_BITS_PER_SECOND = 245_000; // yt-dlp --audio-quality 0 (LAME V0) averages ~245 kbps.

export function videoFamily(codec: string | null | undefined): VideoFamily {
  if (!codec) return "unknown";
  const value = codec.toLowerCase();
  if (value.startsWith("avc") || value.startsWith("h264")) return "h264";
  if (value.startsWith("hev") || value.startsWith("hvc") || value.startsWith("h265")) return "hevc";
  if (value.startsWith("av01") || value === "av1") return "av1";
  if (value.startsWith("vp09") || value.startsWith("vp9")) return "vp9";
  if (value.startsWith("vp8")) return "vp8";
  return "other";
}

export function audioFamily(codec: string | null | undefined): AudioFamily {
  if (!codec) return "unknown";
  const value = codec.toLowerCase();
  if (value.startsWith("mp4a.40.34") || value === "mp3") return "mp3";
  if (value.startsWith("mp4a") || value === "aac") return "aac";
  if (value === "opus") return "opus";
  if (value === "vorbis") return "vorbis";
  if (value === "ac-3" || value === "ac3") return "ac3";
  if (value === "ec-3" || value === "eac3") return "eac3";
  if (value === "flac") return "flac";
  return "other";
}

/** Excludes storyboards, DRM-protected streams and protocols we can't download. */
export function isUsableFormat(format: EngineFormat): boolean {
  if (!format.format_id) return false;
  if (format.has_drm === true) return false;
  if (format.ext === "mhtml" || /mhtml|f4m|ism/i.test(format.protocol ?? "")) return false;
  if (/storyboard/i.test(format.format_note ?? "")) return false;
  if (format.vcodec === "none" && format.acodec === "none") return false;
  return true;
}

export function hasVideo(format: EngineFormat): boolean {
  if (format.vcodec === "none") return false;
  if (format.vcodec) return true;
  if ((format.height ?? 0) > 0) return true;
  // Codec unknown and no height: decide from the file extension (e.g. a direct .mp4 link).
  return !format.acodec && VIDEO_EXTENSIONS.has((format.ext ?? "").toLowerCase());
}

/** true / false, or null when the source doesn't say. */
export function hasAudio(format: EngineFormat): boolean | null {
  if (format.acodec === "none") return false;
  if (format.acodec) return true;
  return format.vcodec === "none" ? true : null;
}

export function formatSize(format: EngineFormat, duration: number | null): SizeEstimate | null {
  if (format.filesize && format.filesize > 0) return { bytes: format.filesize, exact: true };
  if (format.filesize_approx && format.filesize_approx > 0) return { bytes: format.filesize_approx, exact: false };
  if (format.tbr && duration) return { bytes: Math.round(((format.tbr * 1000) / 8) * duration), exact: false };
  return null;
}

function combineSizes(sizes: Array<SizeEstimate | null>): SizeEstimate | null {
  if (sizes.some((size) => size === null)) return null;
  const known = sizes as SizeEstimate[];
  const bytes = known.reduce((total, size) => total + size.bytes, 0);
  // A merged file is close to, but not exactly, the sum of its streams.
  return { bytes, exact: known.length === 1 && known[0].exact };
}

function isDrcAudio(format: EngineFormat): boolean {
  return (format.format_id ?? "").endsWith("-drc") || /\bDRC\b/.test(format.format_note ?? "");
}

function isHdr(format: EngineFormat): boolean {
  return Boolean(format.dynamic_range && format.dynamic_range !== "SDR");
}

function compareScores(a: number[], b: number[]): number {
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (b[index] ?? 0) - (a[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/** Best audio stream for a container: original (non-DRC) track, preferred language, highest bitrate. */
function pickAudio(audioFormats: EngineFormat[], families: AudioFamily[]): EngineFormat | null {
  const candidates = audioFormats.filter((format) => families.includes(audioFamily(format.acodec)));
  const score = (format: EngineFormat) => [
    isDrcAudio(format) ? 0 : 1,
    format.language_preference ?? -1,
    families.length - families.indexOf(audioFamily(format.acodec)),
    format.abr ?? format.tbr ?? 0,
    format.filesize ? 1 : 0,
  ];
  return [...candidates].sort((a, b) => compareScores(score(a), score(b)))[0] ?? null;
}

function videoScore(format: EngineFormat, families: VideoFamily[]): number[] {
  const family = videoFamily(format.vcodec);
  const codecRank = family === "unknown" ? 0 : families.length - families.indexOf(family);
  return [
    codecRank, // most compatible codec first
    isHdr(format) ? 0 : 1, // SDR looks right on every screen
    Math.round(format.fps ?? 0),
    (format.protocol ?? "https").startsWith("http") && !(format.protocol ?? "").includes("m3u8") ? 1 : 0,
    format.filesize || format.filesize_approx ? 1 : 0,
    format.tbr ?? 0,
  ];
}

function compatibilityFor(container: string, video: VideoFamily | null, audio: AudioFamily | null): {
  compatibility: Compatibility;
  note: string;
} {
  if (container === "mp4" && (video === "h264" || video === null) && (audio === "aac" || audio === null || audio === "mp3")) {
    return { compatibility: "universal", note: "Plays on virtually every phone, computer and app." };
  }
  if (container === "mp4" && video === "av1") {
    return {
      compatibility: "modern",
      note: "AV1 video plays on recent devices and browsers. Some older phones and QuickTime may not play it.",
    };
  }
  if (container === "mp4" && video === "hevc") {
    return { compatibility: "modern", note: "HEVC video plays on Apple devices and most recent devices." };
  }
  if (container === "webm") {
    return {
      compatibility: "limited",
      note: "WebM plays in Chrome, Firefox, Android and VLC. Support on iPhone and in QuickTime is limited.",
    };
  }
  if (container === "mp4") {
    return { compatibility: "modern", note: "The source didn’t report every codec, but MP4 plays on most devices." };
  }
  return { compatibility: "limited", note: `${container.toUpperCase()} files may need a player such as VLC.` };
}

/** A single plain HTTP(S) file: FFmpeg can read it while writing a streamable MP4 (HLS/DASH pieces can't). */
function isPlainHttp(format: EngineFormat): boolean {
  return /^https?$/.test(format.protocol ?? "");
}

function outputContainerOf(format: EngineFormat): string {
  const ext = (format.ext ?? "").toLowerCase();
  if (ext === "m4v") return "mp4";
  return ext || "mp4";
}

function withLimits(option: InternalOption, context: BuildContext): InternalOption {
  const partBytes = option.parts.reduce((total, part) => total + (part.size ?? 0), 0);
  const largest = Math.max(option.size?.bytes ?? 0, partBytes);
  if (largest > context.maxFileSizeBytes) {
    return {
      ...option,
      available: false,
      unavailableReason: `Larger than this server’s ${formatBytes(context.maxFileSizeBytes)} limit`,
    };
  }
  return option;
}

function buildVideoOption(
  height: number | null,
  container: string,
  video: EngineFormat,
  audio: EngineFormat | null,
  context: BuildContext,
): InternalOption {
  const vFamily = videoFamily(video.vcodec);
  const muxedAudio = audio ? null : hasAudio(video);
  const aFamily = audio ? audioFamily(audio.acodec) : muxedAudio === false ? null : audioFamily(video.acodec);
  const parts: PlannedPart[] = [{ formatId: video.format_id!, size: formatSize(video, context.duration)?.bytes ?? null }];
  if (audio) parts.push({ formatId: audio.format_id!, size: formatSize(audio, context.duration)?.bytes ?? null });
  const { compatibility, note } = compatibilityFor(
    container,
    vFamily === "unknown" ? null : vFamily,
    aFamily === "unknown" ? null : aFamily,
  );

  return withLimits(
    {
      id: `v${height ?? 0}-${container}`,
      kind: "video",
      label: height ? `${height}p` : "Original",
      badge: resolutionBadge(height),
      height,
      fps: video.fps ? Math.round(video.fps) : null,
      hdr: isHdr(video),
      container,
      videoCodec: VIDEO_LABELS[vFamily],
      audioCodec: aFamily ? AUDIO_LABELS[aFamily] : null,
      hasAudio: audio ? true : muxedAudio,
      requiresMerge: Boolean(audio),
      reencodes: false,
      size: combineSizes([formatSize(video, context.duration), ...(audio ? [formatSize(audio, context.duration)] : [])]),
      compatibility,
      compatibilityNote: note,
      available: true,
      unavailableReason: null,
      // Only MP4: a streamed WebM has no duration, so players can't seek in it.
      streamable: container === "mp4" && isPlainHttp(video) && (!audio || isPlainHttp(audio)),
      selector: audio ? `${video.format_id}+${audio.format_id}` : video.format_id!,
      mergeFormat: audio ? (container as OutputContainer) : null,
      extractAudio: null,
      parts,
    },
    context,
  );
}

function buildAudioOptions(audioOnly: EngineFormat[], muxed: EngineFormat[], context: BuildContext): InternalOption[] {
  const options: InternalOption[] = [];
  const base = { kind: "audio" as const, height: null, fps: null, hdr: false, videoCodec: null, hasAudio: true, requiresMerge: false, streamable: false };

  const asIs = (format: EngineFormat, id: string, label: string, compatibility: Compatibility, note: string) => {
    const size = formatSize(format, context.duration);
    const kbps = Math.round(format.abr ?? format.tbr ?? 0);
    options.push(
      withLimits(
        {
          ...base,
          id,
          label,
          badge: kbps ? `${kbps} kbps` : null,
          container: (format.ext ?? "m4a").toLowerCase(),
          audioCodec: AUDIO_LABELS[audioFamily(format.acodec)],
          reencodes: false,
          size,
          compatibility,
          compatibilityNote: note,
          available: true,
          unavailableReason: null,
          selector: format.format_id!,
          mergeFormat: null,
          extractAudio: null,
          parts: [{ formatId: format.format_id!, size: size?.bytes ?? null }],
        },
        context,
      ),
    );
  };

  const aac = pickAudio(audioOnly, ["aac"]);
  if (aac) asIs(aac, "a-m4a", (aac.ext ?? "").toLowerCase() === "m4a" ? "M4A" : "AAC", "universal", "Original audio, no quality loss. Plays everywhere.");

  const opus = pickAudio(audioOnly, ["opus"]);
  if (opus) {
    asIs(opus, "a-opus", "Opus", "limited", "Original audio, no quality loss. Limited support on iPhone and in QuickTime.");
  }

  if (context.ffmpegAvailable) {
    // MP3 needs re-encoding. Use the best audio stream, or a combined stream if that's all there is.
    const source =
      pickAudio(audioOnly, ["opus", "aac", "vorbis", "flac", "mp3", "eac3", "ac3", "other"]) ??
      [...muxed].filter((format) => hasAudio(format) !== false).sort((a, b) => (a.tbr ?? Infinity) - (b.tbr ?? Infinity))[0] ??
      null;
    if (source) {
      const sourceSize = formatSize(source, context.duration);
      options.push(
        withLimits(
          {
            ...base,
            id: "a-mp3",
            label: "MP3",
            badge: "VBR ~245 kbps",
            container: "mp3",
            audioCodec: "MP3",
            reencodes: true,
            size: context.duration ? { bytes: Math.round((MP3_VBR_BITS_PER_SECOND / 8) * context.duration), exact: false } : null,
            compatibility: "universal",
            compatibilityNote: "Converted (re-encoded) to MP3, so there is a small quality loss compared with the original.",
            available: true,
            unavailableReason: null,
            selector: source.format_id!,
            mergeFormat: null,
            extractAudio: "mp3",
            parts: [{ formatId: source.format_id!, size: sourceSize?.bytes ?? null }],
          },
          context,
        ),
      );
    }
  }
  return options;
}

/**
 * Builds every downloadable option from the engine's formats.
 * Nothing is invented: an option exists only if the formats to produce it exist
 * (and FFmpeg is installed when streams must be merged or converted).
 */
export function buildQualityOptions(formats: EngineFormat[] | null | undefined, context: BuildContext): InternalOption[] {
  const usable = (Array.isArray(formats) ? formats : []).filter(isUsableFormat);
  const videoOnly = usable.filter((format) => hasVideo(format) && hasAudio(format) === false);
  const muxed = usable.filter((format) => hasVideo(format) && hasAudio(format) !== false);
  const audioOnly = usable.filter((format) => !hasVideo(format) && hasAudio(format) !== false);
  const sourceHasSeparateAudio = audioOnly.length > 0;

  const heights = [...new Set([...videoOnly, ...muxed].map((format) => format.height ?? null))].sort(
    (a, b) => (b ?? 0) - (a ?? 0),
  );
  const options: InternalOption[] = [];

  for (const height of heights) {
    const atHeight = (format: EngineFormat) => (format.height ?? null) === height;

    for (const container of ["mp4", "webm"] as OutputContainer[]) {
      const { video: videoFamilies, audio: audioFamilies } = CONTAINER_CODECS[container];
      const candidates: Array<{ video: EngineFormat; audio: EngineFormat | null }> = [];

      for (const format of muxed.filter(atHeight)) {
        const family = videoFamily(format.vcodec);
        if (outputContainerOf(format) === container && (family === "unknown" || videoFamilies.includes(family))) {
          candidates.push({ video: format, audio: null });
        }
      }

      const compatibleVideo = videoOnly.filter((format) => atHeight(format) && videoFamilies.includes(videoFamily(format.vcodec)));
      if (compatibleVideo.length > 0) {
        if (!sourceHasSeparateAudio) {
          // The source has no audio at all, so a silent video is the genuine result.
          for (const format of compatibleVideo.filter((f) => outputContainerOf(f) === container)) {
            candidates.push({ video: format, audio: null });
          }
        } else if (context.ffmpegAvailable) {
          const audio = pickAudio(audioOnly, audioFamilies);
          if (audio) for (const format of compatibleVideo) candidates.push({ video: format, audio });
        }
      }

      const best = candidates.sort((a, b) => {
        const byVideo = compareScores(videoScore(a.video, videoFamilies), videoScore(b.video, videoFamilies));
        return byVideo !== 0 ? byVideo : (b.audio ? 1 : 0) - (a.audio ? 1 : 0);
      })[0];
      if (best) options.push(buildVideoOption(height, container, best.video, best.audio, context));
    }

    // Combined files in other containers (e.g. .mov) are offered as-is when no MP4/WebM exists.
    if (!options.some((option) => option.height === height)) {
      const other = muxed.filter(atHeight).sort((a, b) => (b.tbr ?? 0) - (a.tbr ?? 0))[0];
      if (other) options.push(buildVideoOption(height, outputContainerOf(other), other, null, context));
    }
  }

  options.push(...buildAudioOptions(audioOnly, muxed, context));

  const video = sortVideoOptions(options) as InternalOption[];
  const audio = sortAudioOptions(options) as InternalOption[];
  return [...video, ...audio];
}

/** The id of the option to pre-select: highest available resolution, else best audio. */
export function defaultOptionId(options: QualityOption[]): string | null {
  return selectDefaultOption(options)?.id ?? null;
}

/** Strips the server-only fields before sending options to the browser. */
export function toPublicOption(option: InternalOption): QualityOption {
  const { selector: _selector, mergeFormat: _mergeFormat, extractAudio: _extractAudio, parts: _parts, ...rest } = option;
  return rest;
}
