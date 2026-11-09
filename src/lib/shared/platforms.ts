import type { PlatformId, PlatformInfo } from "../../types/index.ts";

export const PLATFORM_NAMES: Record<PlatformId, string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  facebook: "Facebook",
  x: "X (Twitter)",
  tiktok: "TikTok",
  vimeo: "Vimeo",
  other: "Other website",
};

export const FEATURED_PLATFORMS: PlatformId[] = ["youtube", "instagram", "facebook", "x", "tiktok", "vimeo"];

const PLATFORM_DOMAINS: Array<[PlatformId, string[]]> = [
  ["youtube", ["youtube.com", "youtube-nocookie.com", "youtu.be"]],
  ["instagram", ["instagram.com", "instagr.am"]],
  ["facebook", ["facebook.com", "fb.com", "fb.watch"]],
  ["x", ["x.com", "twitter.com"]],
  ["tiktok", ["tiktok.com"]],
  ["vimeo", ["vimeo.com"]],
];

/** True when `host` is `domain` or a subdomain of it ("notyoutube.com" never matches). */
export function matchesDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/**
 * Detects the platform from the link alone (used for the instant badge in the input).
 * The engine makes the final decision during analysis.
 */
export function detectPlatform(url: string): PlatformInfo {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return { id: "other", name: PLATFORM_NAMES.other };
  }
  for (const [id, domains] of PLATFORM_DOMAINS) {
    if (domains.some((domain) => matchesDomain(host, domain))) return { id, name: PLATFORM_NAMES[id] };
  }
  return { id: "other", name: host || PLATFORM_NAMES.other };
}

/** Maps yt-dlp's extractor name ("Youtube", "TikTokVM", "Generic", …) to our platform list. */
export function platformFromExtractor(extractorKey: string | null | undefined, url: string): PlatformInfo {
  const key = (extractorKey ?? "").toLowerCase();
  const prefixes: Array<[string, PlatformId]> = [
    ["youtube", "youtube"],
    ["instagram", "instagram"],
    ["facebook", "facebook"],
    ["twitter", "x"],
    ["tiktok", "tiktok"],
    ["vimeo", "vimeo"],
  ];
  const match = prefixes.find(([prefix]) => key.startsWith(prefix));
  if (match) return { id: match[1], name: PLATFORM_NAMES[match[1]] };

  const fromUrl = detectPlatform(url);
  if (fromUrl.id !== "other") return fromUrl;
  if (!key || key === "generic") return { id: "other", name: fromUrl.name };
  return { id: "other", name: extractorKey ?? fromUrl.name };
}
