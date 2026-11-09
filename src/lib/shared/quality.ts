import type { QualityOption } from "../../types/index.ts";

/** Output containers in the order we prefer them at the same resolution (most compatible first). */
const VIDEO_CONTAINER_ORDER = ["mp4", "webm"];
const AUDIO_ORDER = ["m4a", "mp3", "opus"];

export function resolutionBadge(height: number | null | undefined): string | null {
  if (!height) return null;
  if (height >= 4320) return "8K";
  if (height >= 2160) return "4K";
  if (height >= 1440) return "2K";
  if (height >= 1080) return "Full HD";
  if (height >= 720) return "HD";
  if (height >= 480) return "SD";
  return null;
}

function containerRank(container: string, order: string[]): number {
  const index = order.indexOf(container);
  return index === -1 ? order.length : index;
}

/** Video options highest resolution first; same resolution → most compatible container first. */
export function sortVideoOptions(options: QualityOption[]): QualityOption[] {
  return options
    .filter((option) => option.kind === "video")
    .sort(
      (a, b) =>
        (b.height ?? 0) - (a.height ?? 0) ||
        containerRank(a.container, VIDEO_CONTAINER_ORDER) - containerRank(b.container, VIDEO_CONTAINER_ORDER),
    );
}

export function sortAudioOptions(options: QualityOption[]): QualityOption[] {
  return options
    .filter((option) => option.kind === "audio")
    .sort((a, b) => containerRank(a.container, AUDIO_ORDER) - containerRank(b.container, AUDIO_ORDER));
}

/**
 * The option selected right after analysis: the highest *available* video resolution
 * (never a hardcoded one). Audio-only is chosen only when there is no usable video.
 */
export function selectDefaultOption(options: QualityOption[]): QualityOption | null {
  const video = sortVideoOptions(options).find((option) => option.available);
  if (video) return video;
  return sortAudioOptions(options).find((option) => option.available) ?? null;
}

export interface ResolutionGroup {
  height: number | null;
  options: QualityOption[];
  available: boolean;
}

/** Groups video options by resolution for the selector (highest first). */
export function groupByResolution(options: QualityOption[]): ResolutionGroup[] {
  const groups = new Map<number | null, QualityOption[]>();
  for (const option of sortVideoOptions(options)) {
    const list = groups.get(option.height) ?? [];
    list.push(option);
    groups.set(option.height, list);
  }
  return [...groups].map(([height, list]) => ({ height, options: list, available: list.some((option) => option.available) }));
}

/** When an option fails, suggest the next lower available video option (or null). */
export function findLowerAlternative(options: QualityOption[], failedId: string): QualityOption | null {
  const failed = options.find((option) => option.id === failedId);
  if (!failed) return null;
  if (failed.kind === "audio") {
    return sortAudioOptions(options).find((option) => option.available && option.id !== failedId) ?? null;
  }
  const sorted = sortVideoOptions(options).filter((option) => option.available && option.id !== failedId);
  return (
    sorted.find((option) => (option.height ?? 0) < (failed.height ?? 0) && option.container === failed.container) ??
    sorted.find((option) => (option.height ?? 0) < (failed.height ?? 0)) ??
    sorted.find((option) => option.height === failed.height) ??
    null
  );
}

/** "2160p · 4K" / "Audio · MP3". */
export function describeOption(option: Pick<QualityOption, "kind" | "label" | "badge">): string {
  if (option.kind === "audio") return `Audio · ${option.label}`;
  return option.badge ? `${option.label} · ${option.badge}` : option.label;
}
