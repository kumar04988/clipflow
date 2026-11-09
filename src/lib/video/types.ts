import type { PlatformInfo } from "../../types/index.ts";
import type { InternalOption } from "./formats.ts";

/** An analysis kept on the server so a download can only use options the server itself produced. */
export interface CachedAnalysis {
  id: string;
  sessionId: string;
  url: string;
  title: string;
  platform: PlatformInfo;
  duration: number | null;
  options: InternalOption[];
  createdAt: number;
}
