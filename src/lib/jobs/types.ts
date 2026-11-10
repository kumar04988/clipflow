import type { ChildProcess } from "node:child_process";
import type { ApiError, JobStatus, MediaItem, PlatformInfo } from "../../types/index.ts";
import type { InternalOption } from "../video/formats.ts";
import type { PartProgress } from "./progress.ts";

/** A download of chosen items from a photo/multi-item post (see CachedMedia). */
export interface MediaJob {
  items: MediaItem[];
  playlist: boolean;
  /** The item being downloaded now (1-based, counted within `items`), 0 before the first starts. */
  current: number;
  /** Bytes of finished items, plus bytes of the current item per stream. */
  doneBytes: number;
  itemBytes: Map<string, number>;
}

export interface JobFile {
  item: MediaItem;
  path: string;
  name: string;
  size: number;
  delivered: boolean;
}

export interface Job {
  id: string;
  sessionId: string;
  analysisId: string;
  url: string;
  title: string;
  platform: PlatformInfo;
  option: InternalOption;
  media: MediaJob | null;
  status: JobStatus;
  phase: string;
  parts: PartProgress[];
  progress: number | null;
  downloadedBytes: number;
  totalBytes: number | null;
  speed: number | null;
  eta: number | null;
  error: ApiError | null;
  createdAt: number;
  updatedAt: number;
  finishedAt: number | null;
  expiresAt: number | null;
  dir: string;
  reportedPath: string | null;
  filePath: string | null;
  fileName: string | null;
  fileSize: number | null;
  /** The separate files of a media job, once it is ready. */
  files: JobFile[] | null;
  delivered: boolean;
  child: ChildProcess | null;
}
