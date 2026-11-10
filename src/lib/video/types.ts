import type { MediaItem, PlatformInfo } from "../../types/index.ts";
import type { InternalOption } from "./formats.ts";

export interface CachedMedia {
  items: MediaItem[];
  /** False for a single-photo post: yt-dlp then reports one entry instead of a list. */
  playlist: boolean;
}

/** An analysis kept on the server so a download can only use options the server itself produced. */
export interface CachedAnalysis {
  id: string;
  sessionId: string;
  url: string;
  title: string;
  platform: PlatformInfo;
  duration: number | null;
  options: InternalOption[];
  media: CachedMedia | null;
  createdAt: number;
}
