"use client";

import { useEffect, useState } from "react";
import { Check, Clock, Copy, ExternalLink, Images, Layers, PencilLine, RotateCcw, User } from "lucide-react";
import { toast } from "sonner";
import type { VideoInfo } from "@/types";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PlatformBadge } from "@/components/shared/platform-icon";
import { Thumbnail } from "@/components/shared/thumbnail";
import { formatDuration } from "@/lib/shared/format";
import { formatDisplayUrl } from "@/lib/shared/url";
import { describeOption, selectDefaultOption } from "@/lib/shared/quality";
import { describeMediaCounts } from "@/lib/shared/media";

const ICON_BUTTON = "grid size-9 shrink-0 place-items-center rounded-md text-subtle transition-colors hover:bg-surface-3 hover:text-foreground";

export function VideoPreview({ info, onChangeUrl, onReset }: { info: VideoInfo; onChangeUrl: () => void; onReset: () => void }) {
  const [copied, setCopied] = useState(false);
  const best = selectDefaultOption(info.options);
  const duration = formatDuration(info.duration);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  const copyLink = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("unsupported");
      await navigator.clipboard.writeText(info.url);
      setCopied(true);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn’t copy the link", { description: "Select the link and copy it manually." });
    }
  };

  return (
    <section aria-labelledby="video-title" className="panel animate-fade-up p-3 sm:p-4">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,300px)_1fr] sm:gap-5">
        <Thumbnail src={info.thumbnail} platformId={info.platform.id} duration={info.duration} />

        <div className="flex min-w-0 flex-col px-1 pb-1 sm:px-0 sm:py-0.5">
          <PlatformBadge platform={info.platform} className="self-start" />
          <h2 id="video-title" className="mt-3 line-clamp-2 text-lg leading-snug font-semibold tracking-tight text-balance break-words sm:text-xl">
            {info.title}
          </h2>

          <dl className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
            {info.uploader && (
              <div className="flex min-w-0 items-center gap-1.5">
                <dt>
                  <User className="size-3.5" aria-hidden="true" />
                  <span className="sr-only">Creator</span>
                </dt>
                <dd className="truncate">{info.uploader}</dd>
              </div>
            )}
            {info.media ? (
              <div className="flex items-center gap-1.5">
                <dt>
                  <Images className="size-3.5" aria-hidden="true" />
                  <span className="sr-only">Items</span>
                </dt>
                <dd className="tabular-nums">{describeMediaCounts(info.media)}</dd>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <dt>
                  <Clock className="size-3.5" aria-hidden="true" />
                  <span className="sr-only">Duration</span>
                </dt>
                <dd className="tabular-nums">{duration ?? "Unknown length"}</dd>
              </div>
            )}
            {best && (
              <div className="flex items-center gap-1.5">
                <dt>
                  <Layers className="size-3.5" aria-hidden="true" />
                  <span className="sr-only">Best available</span>
                </dt>
                <dd>Best: {describeOption(best)}</dd>
              </div>
            )}
          </dl>

          <div className="mt-4 flex min-w-0 items-center gap-0.5 rounded-lg border bg-secondary py-0.5 pr-0.5 pl-3">
            <span className="sr-only">Original link: </span>
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground" title={info.url}>
              {formatDisplayUrl(info.url)}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" onClick={copyLink} aria-label="Copy original link" className={ICON_BUTTON}>
                  {copied ? <Check className="size-4 text-success" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
                </button>
              </TooltipTrigger>
              <TooltipContent>{copied ? "Copied" : "Copy link"}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <a href={info.url} target="_blank" rel="noopener noreferrer" aria-label="Open original video in a new tab" className={ICON_BUTTON}>
                  <ExternalLink className="size-4" aria-hidden="true" />
                </a>
              </TooltipTrigger>
              <TooltipContent>Open original</TooltipContent>
            </Tooltip>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 sm:mt-auto sm:pt-4">
            <Button variant="outline" size="lg" onClick={onChangeUrl}>
              <PencilLine data-icon="inline-start" aria-hidden="true" />
              Change URL
            </Button>
            <Button variant="ghost" size="lg" onClick={onReset}>
              <RotateCcw data-icon="inline-start" aria-hidden="true" />
              Reset
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
