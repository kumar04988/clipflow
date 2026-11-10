// Safe download filenames: no path separators, control characters or header injection.

const MAX_BASE_LENGTH = 120;
const RESERVED_WINDOWS_NAMES = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

export function sanitizeFileBase(input: string | null | undefined): string {
  const cleaned = String(input ?? "")
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
    .replace(/[<>:"/\\|?*]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, "");

  let base = Array.from(cleaned).slice(0, MAX_BASE_LENGTH).join("").trim();
  if (!base || RESERVED_WINDOWS_NAMES.test(base)) base = "video";
  return base;
}

export function sanitizeExtension(extension: string | null | undefined): string {
  const value = String(extension ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return value.slice(0, 8) || "bin";
}

/** The part in brackets of a download name: "2160p", "audio", or "" when the height is unknown. */
export function qualityTag(option: { kind: "video" | "audio"; height: number | null }): string {
  return option.kind === "audio" ? "audio" : option.height ? `${option.height}p` : "";
}

/** "Big Buck Bunny (2160p).mp4" or "Song title (audio).mp3". */
export function buildDownloadFileName(title: string, qualityTag: string, extension: string): string {
  const tag = qualityTag.replace(/[^a-z0-9 ]/gi, "").trim();
  return `${sanitizeFileBase(title)}${tag ? ` (${tag})` : ""}.${sanitizeExtension(extension)}`;
}

/** RFC 6266 Content-Disposition with an ASCII fallback and a UTF-8 filename* for non-English titles. */
export function contentDisposition(fileName: string): string {
  const asciiFallback = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(fileName).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

const MIME_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  opus: "audio/ogg",
  ogg: "audio/ogg",
  aac: "audio/aac",
  flac: "audio/flac",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  avif: "image/avif",
};

export function mimeTypeFor(extension: string): string {
  return MIME_TYPES[sanitizeExtension(extension)] ?? "application/octet-stream";
}
