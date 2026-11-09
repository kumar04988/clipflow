"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/** Handles links like /?url=…&option=v1080-mp4 (used by "Retry" in History). Runs once per link. */
export function LinkFromQuery({ onLink }: { onLink: (url: string, optionId: string | null) => void }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const handled = useRef<string | null>(null);
  const url = searchParams.get("url");
  const option = searchParams.get("option");

  useEffect(() => {
    if (!url || handled.current === url) return;
    handled.current = url;
    onLink(url, option);
    router.replace("/", { scroll: false });
  }, [url, option, onLink, router]);

  return null;
}
