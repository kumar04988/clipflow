import type { SizeEstimate } from "../../types/index.ts";

const UNITS = ["B", "KB", "MB", "GB", "TB"];

/** 125829120 → "120 MB", 1181116006 → "1.1 GB". */
export function formatBytes(bytes: number | null | undefined): string {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return "Unknown size";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  return `${rounded} ${UNITS[unit]}`;
}

/** Exact sizes are shown as-is; estimates get a "≈" prefix. */
export function formatSize(size: SizeEstimate | null | undefined): string {
  if (!size) return "Size unknown";
  return size.exact ? formatBytes(size.bytes) : `≈ ${formatBytes(size.bytes)}`;
}

/** 768 → "12:48", 7212 → "2:00:12". */
export function formatDuration(totalSeconds: number | null | undefined): string | null {
  if (typeof totalSeconds !== "number" || !Number.isFinite(totalSeconds) || totalSeconds < 0) return null;
  const seconds = Math.floor(totalSeconds % 60);
  const minutes = Math.floor((totalSeconds / 60) % 60);
  const hours = Math.floor(totalSeconds / 3600);
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

export function formatEta(seconds: number | null | undefined): string | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) return null;
  if (seconds < 60) return `${Math.ceil(seconds)}s left`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes}m ${Math.round(seconds % 60)}s left` : `${Math.floor(minutes / 60)}h ${minutes % 60}m left`;
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}
