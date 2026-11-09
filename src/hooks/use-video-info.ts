"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { ApiError, QualityOption, VideoInfo } from "@/types";
import { apiFetch, isAbortError, toApiError } from "@/lib/client/api";

type Status = "idle" | "analyzing" | "ready" | "error";

interface State {
  status: Status;
  url: string;
  info: VideoInfo | null;
  error: ApiError | null;
  selectedOptionId: string | null;
  requestId: number;
}

const INITIAL: State = { status: "idle", url: "", info: null, error: null, selectedOptionId: null, requestId: 0 };

/**
 * Real analysis through POST /api/video/info.
 * A request id makes sure an older, slower response can never replace a newer one.
 * (In-flight requests are not aborted on unmount: Next keeps hidden pages mounted and
 * we want the result to be there when the user comes back.)
 */
export function useVideoInfo() {
  const [state, setState] = useState<State>(INITIAL);
  const requestIdRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  const analyze = useCallback(async (url: string, preferredOptionId?: string | null) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const requestId = ++requestIdRef.current;
    setState({ ...INITIAL, status: "analyzing", url, requestId });

    try {
      const info = await apiFetch<VideoInfo>("/api/video/info", {
        method: "POST",
        body: { url },
        signal: controller.signal,
        timeoutMs: 90_000,
      });
      if (requestId !== requestIdRef.current) return;
      const preferred = info.options.find((option) => option.id === preferredOptionId && option.available);
      // A new video always starts from the server's default: the highest available quality.
      setState({ status: "ready", url: info.url, info, error: null, selectedOptionId: preferred?.id ?? info.defaultOptionId, requestId });
    } catch (error) {
      if (requestId !== requestIdRef.current || isAbortError(error)) return;
      setState({ ...INITIAL, status: "error", url, error: toApiError(error), requestId });
    }
  }, []);

  const select = useCallback((optionId: string) => {
    setState((current) => {
      const option = current.info?.options.find((candidate) => candidate.id === optionId);
      return option?.available ? { ...current, selectedOptionId: optionId } : current;
    });
  }, []);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    requestIdRef.current += 1;
    setState({ ...INITIAL, requestId: requestIdRef.current });
  }, []);

  const selectedOption: QualityOption | null = useMemo(
    () => state.info?.options.find((option) => option.id === state.selectedOptionId) ?? null,
    [state.info, state.selectedOptionId],
  );

  return { ...state, selectedOption, analyze, select, reset };
}
