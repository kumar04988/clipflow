"use client";

import { useState } from "react";
import { Film } from "lucide-react";
import type { PlatformId } from "@/types";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/shared/format";
import { PlatformIcon } from "./platform-icon";

/**
 * The video's real thumbnail, loaded directly by the browser from the platform's CDN.
 * (Deliberately not next/image: its optimizer would make our server fetch arbitrary remote URLs.)
 * Falls back to a neutral placeholder if there is no thumbnail or it fails to load.
 */
export function Thumbnail({ src, platformId, duration, className }: { src: string | null; platformId: PlatformId; duration: number | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  const durationLabel = formatDuration(duration);
  const showImage = src && !failed;

  return (
    <div className={cn("relative aspect-video overflow-hidden rounded-xl bg-secondary", className)}>
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          loading="eager"
          decoding="async"
          onError={() => setFailed(true)}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(120%_90%_at_30%_10%,color-mix(in_oklab,var(--primary)_22%,transparent),transparent_60%)]">
          <div className="flex flex-col items-center gap-2 text-subtle">
            <PlatformIcon platformId={platformId} size="lg" />
            <span className="flex items-center gap-1.5 text-xs">
              <Film className="size-3.5" aria-hidden="true" />
              No preview available
            </span>
          </div>
        </div>
      )}
      <span className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-black/10 ring-inset dark:ring-white/8" />
      {durationLabel && (
        <span className="absolute right-2 bottom-2 rounded-md bg-black/75 px-1.5 py-0.5 text-[11px] font-medium text-white tabular-nums">
          {durationLabel}
        </span>
      )}
    </div>
  );
}
