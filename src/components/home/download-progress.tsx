import { LoaderCircle, WifiOff, X } from "lucide-react";
import type { JobView } from "@/types";
import { Button } from "@/components/ui/button";
import { formatBytes, formatEta } from "@/lib/shared/format";

/**
 * Server-side preparation progress. A percentage is shown only when the engine reports real sizes;
 * merging/converting and unknown-size streams use an indeterminate bar.
 */
export function DownloadProgress({ job, reconnecting, onCancel }: { job: JobView; reconnecting: boolean; onCancel: () => void }) {
  const percent = job.progress;
  const determinate = percent !== null && job.status === "downloading";
  const eta = formatEta(job.eta);
  const details =
    job.status === "downloading"
      ? [
          job.totalBytes ? `${formatBytes(job.downloadedBytes)} of ${formatBytes(job.totalBytes)}` : `${formatBytes(job.downloadedBytes)} downloaded`,
          job.speed ? `${formatBytes(job.speed)}/s` : null,
          eta,
        ]
          .filter(Boolean)
          .join(" · ")
      : job.status === "queued"
        ? "Your download will start automatically."
        : "This step doesn’t report a percentage.";
  // Screen readers get coarse updates instead of every tick.
  const announcement = determinate ? `${job.phase}, ${Math.floor((percent ?? 0) / 25) * 25}%` : job.phase;

  return (
    <div className="animate-in fade-in-0">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="flex min-w-0 items-center gap-2 font-medium">
          <LoaderCircle className="size-4 shrink-0 animate-spin text-brand" aria-hidden="true" />
          <span className="truncate">{job.phase}…</span>
        </span>
        {determinate && <span className="font-semibold tabular-nums">{percent}%</span>}
      </div>

      <div
        role="progressbar"
        aria-label="Preparing your file on the server"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={determinate ? (percent ?? undefined) : undefined}
        aria-valuetext={determinate ? `${percent}%` : job.phase}
        className="relative mt-3 h-2 overflow-hidden rounded-full bg-surface-3"
      >
        {determinate ? (
          <div className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out" style={{ width: `${percent}%` }} />
        ) : (
          <div className="absolute inset-y-0 w-2/5 animate-indeterminate rounded-full bg-primary/70" />
        )}
      </div>

      <p className="mt-2 text-xs text-subtle tabular-nums">{details}</p>
      {reconnecting && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-warning">
          <WifiOff className="size-3.5" aria-hidden="true" />
          Connection lost — reconnecting. Your file keeps preparing on the server.
        </p>
      )}
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>

      <Button variant="outline" size="xl" className="mt-4 w-full" onClick={onCancel}>
        <X data-icon="inline-start" aria-hidden="true" />
        Cancel
      </Button>
    </div>
  );
}
