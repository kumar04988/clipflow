// Parses a single HTTP Range header so interrupted downloads (common on mobile) can resume.

export type RangeResult = { start: number; end: number } | "unsatisfiable" | null;

/**
 * Returns the byte range to send, null to send the whole file,
 * or "unsatisfiable" for a range outside the file (→ 416).
 * Multiple ranges are not supported and fall back to the whole file.
 */
export function parseRange(header: string | null, size: number): RangeResult {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, startText, endText] = match;
  if (!startText && !endText) return null;

  let start: number;
  let end: number;
  if (!startText) {
    // "bytes=-500" → the last 500 bytes.
    const suffix = Number(endText);
    if (suffix === 0) return "unsatisfiable";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(startText);
    end = endText ? Math.min(Number(endText), size - 1) : size - 1;
  }

  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
    return "unsatisfiable";
  }
  return { start, end };
}
