import type { ChildProcess } from "node:child_process";
import type { ApiError, JobStatus, PlatformInfo } from "../../types/index.ts";
import type { InternalOption } from "../video/formats.ts";
import type { PartProgress } from "./progress.ts";

export interface Job {
  id: string;
  sessionId: string;
  analysisId: string;
  url: string;
  title: string;
  platform: PlatformInfo;
  option: InternalOption;
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
  delivered: boolean;
  child: ChildProcess | null;
}
