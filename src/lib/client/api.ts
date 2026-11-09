import type { ApiError } from "@/types";

export class ApiRequestError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ApiRequestError";
    this.code = code;
    this.status = status;
  }
}

interface FetchOptions {
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/** JSON fetch with a timeout and friendly errors. (No AbortSignal.any: older iPhones lack it.) */
export async function apiFetch<T>(url: string, { method = "GET", body, signal, timeoutMs = 30_000 }: FetchOptions = {}): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const forwardAbort = () => controller.abort();
  signal?.addEventListener("abort", forwardAbort, { once: true });

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (timedOut) throw new ApiRequestError("timeout", "The server took too long to respond. Please try again.", 0);
    throw new ApiRequestError("network_error", "Couldn’t reach the server. Check your internet connection and try again.", 0);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", forwardAbort);
  }

  const data = (await response.json().catch(() => null)) as { error?: ApiError } | null;
  if (!response.ok) {
    throw new ApiRequestError(
      data?.error?.code ?? "http_error",
      data?.error?.message ?? `The server responded with an error (${response.status}).`,
      response.status,
    );
  }
  return data as T;
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiRequestError) return { code: error.code, message: error.message };
  return { code: "unknown", message: "Something unexpected happened. Please try again." };
}

/** The browser saves this link's file while the server is still making it. */
export function streamDownloadUrl(analysisId: string, optionId: string): string {
  return `/api/download/stream?${new URLSearchParams({ analysisId, optionId })}`;
}

/**
 * Starts a normal browser download (no file is held in page memory).
 * Works on iOS Safari/Chrome, Android and desktop; the server sends Content-Disposition: attachment.
 */
export function triggerFileDownload(url: string): void {
  const link = document.createElement("a");
  link.href = url;
  link.rel = "noopener";
  link.setAttribute("download", "");
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function isAppleMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
