"use client";

import Link from "next/link";
import { ArrowDownToLine, CircleCheck, CircleX, Clock, Copy, LoaderCircle, RotateCw, Trash } from "lucide-react";
import { toast } from "sonner";
import type { HistoryEntry, JobStatus } from "@/types";
import { isActiveStatus } from "@/types";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PlatformIcon } from "@/components/shared/platform-icon";
import { formatDateTime, formatSize } from "@/lib/shared/format";
import { formatDisplayUrl } from "@/lib/shared/url";
import { cn } from "@/lib/utils";

const STATUS: Record<JobStatus, { label: string; className: string }> = {
  queued: { label: "Waiting", className: "bg-primary/12 text-brand" },
  preparing: { label: "Preparing", className: "bg-primary/12 text-brand" },
  downloading: { label: "Downloading", className: "bg-primary/12 text-brand" },
  merging: { label: "Merging", className: "bg-primary/12 text-brand" },
  converting: { label: "Converting", className: "bg-primary/12 text-brand" },
  finalizing: { label: "Finalizing", className: "bg-primary/12 text-brand" },
  ready: { label: "Completed", className: "bg-success/12 text-success" },
  failed: { label: "Failed", className: "bg-destructive/12 text-destructive" },
  cancelled: { label: "Cancelled", className: "bg-secondary text-muted-foreground" },
  expired: { label: "Completed · file expired", className: "bg-secondary text-muted-foreground" },
};

function StatusBadge({ status }: { status: JobStatus }) {
  const { label, className } = STATUS[status];
  const Icon = isActiveStatus(status) ? LoaderCircle : status === "ready" || status === "expired" ? CircleCheck : CircleX;
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", className)}>
      <Icon className={cn("size-3", isActiveStatus(status) && "animate-spin")} aria-hidden="true" />
      {label}
    </span>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground tabular-nums">
      <span className="sr-only">{label}: </span>
      {children}
    </span>
  );
}

function IconAction({ label, children, ...props }: { label: string; children: React.ReactNode } & React.ComponentProps<"button">) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-xl" aria-label={label} className="text-subtle hover:text-foreground" {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label.split(" “")[0]}</TooltipContent>
    </Tooltip>
  );
}

export function HistoryItem({ entry, onRemove }: { entry: HistoryEntry; onRemove: (id: string) => void }) {
  const active = isActiveStatus(entry.status);
  const retryHref = `/?url=${encodeURIComponent(entry.url)}&option=${encodeURIComponent(entry.optionId)}`;

  const copyLink = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("unsupported");
      await navigator.clipboard.writeText(entry.url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn’t copy the link", { description: "Select the link and copy it manually." });
    }
  };

  return (
    <li className="panel flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:p-4">
      <div className="flex min-w-0 flex-1 gap-3.5">
        <PlatformIcon platformId={entry.platform.id} size="lg" className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="min-w-0 truncate text-sm font-semibold" title={entry.title}>
              {entry.title}
            </h2>
            <StatusBadge status={entry.status} />
          </div>
          <p className="mt-0.5 truncate font-mono text-xs text-subtle" title={entry.url}>
            <span className="sr-only">Link: </span>
            {formatDisplayUrl(entry.url)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Meta label="Platform">{entry.platform.name}</Meta>
            <Meta label="Quality">{entry.quality}</Meta>
            <Meta label="Format">{entry.format}</Meta>
            <Meta label="Size">{formatSize(entry.size)}</Meta>
            <time dateTime={entry.createdAt} className="ml-1 text-xs text-subtle">
              {formatDateTime(entry.createdAt)}
            </time>
          </div>
          {entry.status === "failed" && entry.error && <p className="mt-1.5 text-xs text-destructive">{entry.error}</p>}
          {entry.fileAvailable && entry.expiresAt && (
            <p className="mt-1.5 flex items-center gap-1 text-xs text-subtle">
              <Clock className="size-3" aria-hidden="true" />
              File available until {formatDateTime(entry.expiresAt)}
            </p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 self-end sm:self-center">
        {entry.fileAvailable && entry.fileUrl && (
          <Button asChild size="lg" className="mr-1">
            <a href={entry.fileUrl} download>
              <ArrowDownToLine data-icon="inline-start" aria-hidden="true" />
              Save
            </a>
          </Button>
        )}
        {!active && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild variant="ghost" size="icon-xl" className="text-subtle hover:text-foreground">
                <Link href={retryHref} aria-label={`Download “${entry.title}” again`}>
                  <RotateCw aria-hidden="true" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Download again</TooltipContent>
          </Tooltip>
        )}
        <IconAction label={`Copy link of “${entry.title}”`} onClick={copyLink}>
          <Copy aria-hidden="true" />
        </IconAction>
        {!active && (
          <IconAction label={`Remove “${entry.title}” from history`} onClick={() => onRemove(entry.id)} className="text-subtle hover:text-destructive">
            <Trash aria-hidden="true" />
          </IconAction>
        )}
      </div>
    </li>
  );
}
