// URL validation used by both the browser (instant feedback) and the server (authoritative check).
// The input is only parsed with the WHATWG URL parser — never evaluated or passed to a shell.

export const MAX_URL_LENGTH = 2048;
const ALLOWED_PORTS = new Set(["", "80", "443", "8080", "8443"]);
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;
// "youtube.com/watch?v=…" or "www.example.org" — a host with a dot and no scheme.
const BARE_HOST_PATTERN = /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?([/?#]|$)/i;
const TRACKING_PARAMS = new Set(["fbclid", "gclid", "igsh", "igshid", "si", "feature", "ref_src", "ref_url", "mibextid"]);

export type UrlValidation = { ok: true; url: string } | { ok: false; error: string };

export function validateUrl(input: unknown): UrlValidation {
  const value = typeof input === "string" ? input.trim() : "";

  if (!value) return { ok: false, error: "Paste a video link to get started." };
  if (value.length > MAX_URL_LENGTH) {
    return { ok: false, error: "This link is too long. Check that you copied a single link." };
  }

  const hasScheme = SCHEME_PATTERN.test(value);
  if (!hasScheme && !BARE_HOST_PATTERN.test(value)) {
    return { ok: false, error: "This doesn’t look like a link. Try something like https://youtube.com/watch?v=…" };
  }
  if (/\s/.test(value)) {
    return { ok: false, error: "Links can’t contain spaces. Check that you pasted a single link." };
  }

  let parsed: URL;
  try {
    parsed = new URL(hasScheme ? value : `https://${value}`);
  } catch {
    return { ok: false, error: "This link is malformed. Copy it again from the video page." };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "Only http:// and https:// links are supported." };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, error: "Links with a username or password aren’t supported." };
  }
  if (!ALLOWED_PORTS.has(parsed.port)) {
    return { ok: false, error: "Links that use unusual network ports aren’t supported." };
  }

  const host = parsed.hostname;
  const isIpLiteral = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[");
  if (!host || (!host.includes(".") && !isIpLiteral) || host.endsWith(".")) {
    return { ok: false, error: "Enter a complete link that includes the website, like https://vimeo.com/…" };
  }

  return { ok: true, url: normalizeVideoUrl(parsed).href };
}

/** Removes fragments and tracking parameters, and maps mobile YouTube hosts to the canonical one. */
export function normalizeVideoUrl(url: URL): URL {
  const normalized = new URL(url.href);
  normalized.hash = "";
  for (const key of [...normalized.searchParams.keys()]) {
    if (key.startsWith("utm_") || TRACKING_PARAMS.has(key)) normalized.searchParams.delete(key);
  }
  if (normalized.hostname === "m.youtube.com" || normalized.hostname === "youtube.com") {
    normalized.hostname = "www.youtube.com";
  }
  return normalized;
}

/** "https://www.youtube.com/watch?v=abc" → "youtube.com/watch?v=abc" for compact display. */
export function formatDisplayUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    return `${parsed.hostname.replace(/^www\./, "")}${path}${parsed.search}`;
  } catch {
    return url;
  }
}
