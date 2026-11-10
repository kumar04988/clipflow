// Types shared by the API routes and the browser code.

export type PlatformId = "youtube" | "instagram" | "facebook" | "x" | "tiktok" | "vimeo" | "other";

export interface PlatformInfo {
  id: PlatformId;
  name: string;
}

/** `exact: false` means the source only gave an estimate (or we calculated one). */
export interface SizeEstimate {
  bytes: number;
  exact: boolean;
}

export type OptionKind = "video" | "audio";

/** How widely the output plays without extra apps. */
export type Compatibility = "universal" | "modern" | "limited";

/** One downloadable choice, built from the formats the engine actually reported. */
export interface QualityOption {
  id: string;
  kind: OptionKind;
  label: string;
  badge: string | null;
  height: number | null;
  fps: number | null;
  hdr: boolean;
  /** Output file extension, e.g. "mp4", "webm", "m4a", "mp3". */
  container: string;
  videoCodec: string | null;
  audioCodec: string | null;
  /** null when the source does not say whether there is audio. */
  hasAudio: boolean | null;
  requiresMerge: boolean;
  reencodes: boolean;
  size: SizeEstimate | null;
  compatibility: Compatibility;
  compatibilityNote: string;
  available: boolean;
  unavailableReason: string | null;
  /** True when the server can send the file while making it, so the browser's download starts at once. */
  streamable: boolean;
}

export type MediaKind = "video" | "photo";

/** One slide of a post that holds several photos/videos (e.g. an Instagram carousel). */
export interface MediaItem {
  /** 1-based position in the post; also the id used to request it. */
  index: number;
  kind: MediaKind;
  /** A small preview image, not the full-size photo. */
  thumbnail: string | null;
  duration: number | null;
}

export interface VideoInfo {
  analysisId: string;
  url: string;
  platform: PlatformInfo;
  title: string;
  uploader: string | null;
  duration: number | null;
  thumbnail: string | null;
  options: QualityOption[];
  defaultOptionId: string | null;
  /** Set when nothing can be downloaded for this video (e.g. longer than the server limit). */
  blockedReason: string | null;
  /** Set for photo posts and multi-item posts; `options` is then empty and items are downloaded by index. */
  media: MediaItem[] | null;
  expiresAt: string;
}

export type JobStatus =
  | "queued"
  | "preparing"
  | "downloading"
  | "merging"
  | "converting"
  | "finalizing"
  | "ready"
  | "failed"
  | "cancelled"
  | "expired";

export interface ApiError {
  code: string;
  message: string;
}

/** One file of a multi-item download; each is saved separately. */
export interface JobFileView {
  index: number;
  kind: MediaKind;
  fileName: string;
  fileSize: number;
  fileUrl: string;
  delivered: boolean;
}

export interface JobView {
  id: string;
  analysisId: string;
  optionId: string;
  status: JobStatus;
  /** Human-readable step, e.g. "Downloading video stream". */
  phase: string;
  /** 0–100, or null when the engine can't report a real percentage. */
  progress: number | null;
  downloadedBytes: number;
  totalBytes: number | null;
  speed: number | null;
  eta: number | null;
  queuePosition: number | null;
  title: string;
  quality: string;
  format: string;
  fileName: string | null;
  fileSize: number | null;
  fileUrl: string | null;
  /** Set (instead of fileName/fileUrl) when chosen items of a post are ready as separate files. */
  files: JobFileView[] | null;
  expiresAt: string | null;
  /** True once the server has finished sending the whole file (every file) to a browser. */
  delivered: boolean;
  error: ApiError | null;
  createdAt: string;
  updatedAt: string;
}

export interface HistoryEntry {
  id: string;
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
  fileAvailable: boolean;
  fileUrl: string | null;
  delivered: boolean;
}

export interface EngineStatus {
  ready: boolean;
  ytDlpVersion: string | null;
  ffmpeg: boolean;
  message: string | null;
  limits: {
    maxFileSizeMb: number;
    maxDurationMinutes: number;
    fileTtlMinutes: number;
  };
}

export const ACTIVE_JOB_STATUSES: readonly JobStatus[] = [
  "queued",
  "preparing",
  "downloading",
  "merging",
  "converting",
  "finalizing",
];

export function isActiveStatus(status: JobStatus): boolean {
  return ACTIVE_JOB_STATUSES.includes(status);
}
