"use client";

import { useEffect, useState } from "react";
import type { EngineStatus } from "@/types";

/** Reads GET /api/health once so the UI can warn when the server can't download (e.g. tools missing). */
export function useEngineStatus() {
  const [status, setStatus] = useState<EngineStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health", { cache: "no-store" })
      .then((response) => response.json() as Promise<EngineStatus>)
      .then((data) => {
        if (!cancelled) setStatus(data);
      })
      .catch(() => {
        // The health check is advisory; the real requests report their own errors.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}
