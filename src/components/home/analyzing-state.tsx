"use client";

import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PlatformBadge } from "@/components/shared/platform-icon";
import { detectPlatform } from "@/lib/shared/platforms";

/** Loading skeleton shaped like the result. Shows real elapsed time instead of fake steps. */
export function AnalyzingState({ url }: { url: string }) {
  const [seconds, setSeconds] = useState(0);
  const platform = detectPlatform(url);

  useEffect(() => {
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="grid animate-in gap-4 fade-in-0 lg:gap-5">
      <div className="panel p-3 sm:p-4">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,300px)_1fr] sm:gap-5">
          <Skeleton className="aspect-video rounded-xl" />
          <div className="flex flex-col gap-3 py-0.5">
            <PlatformBadge platform={platform} className="self-start" />
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="h-4 w-2/5" />
            <p role="status" className="mt-2 flex items-center gap-2 text-[13px] text-muted-foreground sm:mt-auto">
              <LoaderCircle className="size-4 animate-spin text-brand" aria-hidden="true" />
              Retrieving video details and formats{platform.id !== "other" ? ` from ${platform.name}` : ""}…
              <span className="text-subtle tabular-nums">{seconds}s</span>
            </p>
            {seconds >= 12 && (
              <p className="text-xs text-subtle">Some platforms take a little longer to respond. Still working…</p>
            )}
          </div>
        </div>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-5">
        <div className="panel grid gap-2 p-4 sm:p-5">
          <Skeleton className="mb-2 h-5 w-36" />
          {[0, 1, 2, 3].map((row) => (
            <Skeleton key={row} className="h-14 rounded-xl" />
          ))}
        </div>
        <div className="panel grid gap-3 p-4 sm:p-5">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-12 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
