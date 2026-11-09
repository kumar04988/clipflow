"use client";

import { useCallback, useEffect, useState } from "react";
import type { ApiError, HistoryEntry } from "@/types";
import { isActiveStatus } from "@/types";
import { apiFetch, toApiError } from "@/lib/client/api";

const ACTIVE_POLL_MS = 2000;

/** History from GET /api/history. Refreshes every 2s while any entry is still being prepared. */
export function useHistory() {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch<{ entries: HistoryEntry[] }>("/api/history", { timeoutMs: 15_000 });
      setEntries(data.entries);
      setError(null);
    } catch (fetchError) {
      setError(toApiError(fetchError));
    }
  }, []);

  useEffect(() => {
    // Load on mount (and again whenever the page becomes visible again).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const hasActive = entries?.some((entry) => isActiveStatus(entry.status)) ?? false;
  useEffect(() => {
    if (!hasActive) return;
    const timer = setInterval(() => void refresh(), ACTIVE_POLL_MS);
    return () => clearInterval(timer);
  }, [hasActive, refresh]);

  const remove = useCallback(async (id: string) => {
    await apiFetch(`/api/history/${id}`, { method: "DELETE" });
    setEntries((current) => current?.filter((entry) => entry.id !== id) ?? current);
  }, []);

  const clear = useCallback(async () => {
    await apiFetch("/api/history", { method: "DELETE" });
    await refresh();
  }, [refresh]);

  return { entries, error, refresh, remove, clear };
}
