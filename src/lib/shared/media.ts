import type { MediaItem } from "../../types/index.ts";

/** "1 item", "3 photos". */
export function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** "4 videos · 16 photos", "1 photo". */
export function describeMediaCounts(items: Pick<MediaItem, "kind">[]): string {
  const videos = items.filter((item) => item.kind === "video").length;
  const photos = items.length - videos;
  return [videos ? countLabel(videos, "video") : null, photos ? countLabel(photos, "photo") : null].filter(Boolean).join(" · ");
}
