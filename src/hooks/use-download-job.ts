"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiError, JobView } from "@/types";
import { isActiveStatus } from "@/types";
import { apiFetch, ApiRequestError, toApiError, triggerFileDownload } from "@/lib/client/api";

const POLL_MS = 800;
const DELIVERY_POLL_MS = 2000;
const DELIVERY_WATCH_MS = 15 * 60_000;

/**
 * Creates a download job and follows it by polling GET /api/download/:id.
 * - Polling lives in an effect, so it pauses when the page is hidden and resumes on return.
 * - Network hiccups (common on phones) are retried with backoff instead of failing the job.
 * - When the file becomes ready, the browser download starts automatically once.
 */
export function useDownloadJob() {
  const [job, setJob] = useState<JobView | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<ApiError | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [watchDeliveryUntil, setWatchDeliveryUntil] = useState(0);
  // Streamed downloads run in the browser's own download manager, so the page only knows one was started.
  const [streamedOptionId, setStreamedOptionId] = useState<string | null>(null);
  const jobIdRef = useRef<string | null>(null);
  const startingRef = useRef(false);
  const seenActiveRef = useRef(new Set<string>());
  const autoSavedRef = useRef(new Set<string>());

  const isActive = job ? isActiveStatus(job.status) : false;
  const watchingDelivery = Boolean(job && job.status === "ready" && !job.delivered && watchDeliveryUntil > 0);

  const start = useCallback(async (analysisId: string, optionId: string) => {
    if (startingRef.current) return; // ignore double clicks
    startingRef.current = true;
    setStarting(true);
    setStartError(null);
    try {
      const { job: created } = await apiFetch<{ job: JobView }>("/api/download", {
        method: "POST",
        body: { analysisId, optionId },
        timeoutMs: 20_000,
      });
      jobIdRef.current = created.id;
      setWatchDeliveryUntil(0);
      setJob(created);
    } catch (error) {
      setStartError(toApiError(error));
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }, []);

  useEffect(() => {
    if (!job || (!isActive && !watchingDelivery)) return;
    const id = job.id;
    if (isActive) seenActiveRef.current.add(id);
    let stopped = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const { job: next } = await apiFetch<{ job: JobView }>(`/api/download/${id}`, { timeoutMs: 15_000 });
        if (stopped || jobIdRef.current !== id) return;
        failures = 0;
        setReconnecting(false);
        setJob(next);
        if (!isActiveStatus(next.status) && (next.status !== "ready" || next.delivered || Date.now() > watchDeliveryUntil)) return;
      } catch (error) {
        if (stopped || jobIdRef.current !== id) return;
        if (error instanceof ApiRequestError && error.status === 404) {
          setJob((current) =>
            current?.id === id
              ? { ...current, status: "failed", error: { code: "not_found", message: "This download is no longer known to the server (it may have restarted)." } }
              : current,
          );
          return;
        }
        failures += 1;
        setReconnecting(true);
      }
      const delay = failures > 0 ? Math.min(1000 * 2 ** failures, 10_000) : isActiveStatus(job.status) ? POLL_MS : DELIVERY_POLL_MS;
      timer = setTimeout(poll, delay);
    };

    timer = setTimeout(poll, isActive ? POLL_MS : DELIVERY_POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
    // Re-run only when the job changes or switches between active / watching.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, isActive, watchingDelivery]);

  /** Call when the user taps the "Save file" link, to watch for the server confirming delivery. */
  const markSaving = useCallback(() => setWatchDeliveryUntil(Date.now() + DELIVERY_WATCH_MS), []);

  const save = useCallback(
    (target: JobView) => {
      if (!target.fileUrl) return;
      triggerFileDownload(target.fileUrl);
      markSaving();
    },
    [markSaving],
  );

  // Start the browser download automatically when a job we watched becomes ready.
  useEffect(() => {
    if (job?.status !== "ready" || !job.fileUrl) return;
    if (!seenActiveRef.current.has(job.id) || autoSavedRef.current.has(job.id)) return;
    autoSavedRef.current.add(job.id);
    save(job);
  }, [job, save]);

  const cancel = useCallback(async () => {
    const id = jobIdRef.current;
    if (!id) return;
    try {
      const { job: cancelled } = await apiFetch<{ job: JobView }>(`/api/download/${id}/cancel`, { method: "POST", timeoutMs: 15_000 });
      if (jobIdRef.current === id) setJob(cancelled);
    } catch (error) {
      setStartError(toApiError(error));
    }
  }, []);

  const markStreamed = useCallback((optionId: string) => setStreamedOptionId(optionId), []);

  const reset = useCallback(() => {
    jobIdRef.current = null;
    setJob(null);
    setStartError(null);
    setReconnecting(false);
    setWatchDeliveryUntil(0);
    setStreamedOptionId(null);
  }, []);

  return { job, starting, startError, reconnecting, isActive, streamedOptionId, start, cancel, reset, markSaving, markStreamed };
}
