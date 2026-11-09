// Parses yt-dlp progress lines and turns per-stream progress into one honest overall value.

export const PROGRESS_PREFIX = "[cfprogress]";
export const FILE_PREFIX = "[cffile]";

/** Passed to yt-dlp's --progress-template: "[cfprogress] formatId|status|downloaded|total|estimate|speed|eta". */
export const PROGRESS_TEMPLATE =
  `download:${PROGRESS_PREFIX} %(info.format_id)s|%(progress.status)s|%(progress.downloaded_bytes)s|` +
  "%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s";

export interface ProgressLine {
  formatId: string;
  status: string;
  downloaded: number | null;
  total: number | null;
  speed: number | null;
  eta: number | null;
}

function toNumber(value: string | undefined): number | null {
  if (value === undefined || value === "NA" || value === "None" || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function parseProgressLine(line: string): ProgressLine | null {
  const start = line.indexOf(PROGRESS_PREFIX);
  if (start === -1) return null;
  const fields = line.slice(start + PROGRESS_PREFIX.length).trim().split("|");
  if (fields.length < 7 || !fields[0]) return null;
  const [formatId, status, downloaded, total, estimate, speed, eta] = fields;
  return {
    formatId,
    status,
    downloaded: toNumber(downloaded),
    total: toNumber(total) ?? toNumber(estimate),
    speed: toNumber(speed),
    eta: toNumber(eta),
  };
}

export interface PartProgress {
  formatId: string;
  /** Size known from the analysis, used until the engine reports its own total. */
  expectedSize: number | null;
  downloaded: number;
  total: number | null;
  done: boolean;
}

export interface OverallProgress {
  /** null when any stream's size is unknown — we don't invent a percentage. */
  percent: number | null;
  downloadedBytes: number;
  totalBytes: number | null;
}

export function computeOverallProgress(parts: PartProgress[]): OverallProgress {
  let downloaded = 0;
  let total = 0;
  let totalKnown = parts.length > 0;
  for (const part of parts) {
    const partTotal = part.done ? Math.max(part.downloaded, part.total ?? 0) : (part.total ?? part.expectedSize);
    downloaded += part.done && partTotal ? partTotal : part.downloaded;
    if (partTotal && partTotal > 0) total += partTotal;
    else totalKnown = false;
  }
  if (!totalKnown || total <= 0) return { percent: null, downloadedBytes: downloaded, totalBytes: null };
  const allDone = parts.every((part) => part.done);
  // Never show 100% until every stream has finished.
  const percent = allDone ? 100 : Math.min(99, Math.floor((downloaded / total) * 100));
  return { percent, downloadedBytes: Math.min(downloaded, total), totalBytes: total };
}
