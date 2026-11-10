"use client";

import { useState } from "react";
import { Check, Download, Film, ImageIcon } from "lucide-react";
import type { MediaItem } from "@/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/shared/format";
import { countLabel, describeMediaCounts } from "@/lib/shared/media";

function MediaTile({ item, selected, onToggle }: { item: MediaItem; selected: boolean; onToggle: () => void }) {
  const [failed, setFailed] = useState(false);
  const KindIcon = item.kind === "video" ? Film : ImageIcon;
  const duration = formatDuration(item.duration);

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${item.kind === "video" ? "Video" : "Photo"} ${item.index}`}
      onClick={onToggle}
      className={cn(
        "group relative aspect-square overflow-hidden rounded-lg bg-secondary ring-offset-2 ring-offset-popover transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        selected ? "ring-2 ring-primary" : "opacity-60 hover:opacity-90",
      )}
    >
      {item.thumbnail && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.thumbnail}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <span className="absolute inset-0 grid place-items-center text-subtle">
          <KindIcon className="size-6" aria-hidden="true" />
        </span>
      )}
      <span
        className={cn(
          "absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full border-2 border-white shadow-sm",
          selected ? "bg-primary" : "bg-black/30",
        )}
      >
        {selected && <Check className="size-3 text-primary-foreground" strokeWidth={3} aria-hidden="true" />}
      </span>
      <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white tabular-nums">
        <KindIcon className="size-3" aria-hidden="true" />
        {item.index}
        {duration && <span className="text-white/80">· {duration}</span>}
      </span>
    </button>
  );
}

interface MediaPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: MediaItem[];
  selected: Set<number>;
  onSelectedChange: (selected: Set<number>) => void;
  onDownload: () => void;
}

export function MediaPickerDialog({ open, onOpenChange, items, selected, onSelectedChange, onDownload }: MediaPickerDialogProps) {
  const allSelected = selected.size === items.length;
  const chosen = items.filter((item) => selected.has(item.index));

  const toggle = (index: number) => {
    const next = new Set(selected);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    onSelectedChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid-rows-[auto_auto_minmax(0,1fr)_auto] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Choose what to download</DialogTitle>
          <DialogDescription>
            This post has {countLabel(items.length, "item")} ({describeMediaCounts(items)}). Tap an item to leave it out.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3 text-[13px]">
          <span className="text-muted-foreground tabular-nums" aria-live="polite">
            {selected.size} of {items.length} selected
          </span>
          <Button variant="outline" size="sm" onClick={() => onSelectedChange(allSelected ? new Set() : new Set(items.map((item) => item.index)))}>
            {allSelected ? "Clear all" : "Select all"}
          </Button>
        </div>

        <div className="-mx-1 overflow-y-auto px-1 py-1">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-2.5">
            {items.map((item) => (
              <MediaTile key={item.index} item={item} selected={selected.has(item.index)} onToggle={() => toggle(item.index)} />
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="xl" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="xl" disabled={chosen.length === 0} onClick={onDownload}>
            <Download data-icon="inline-start" aria-hidden="true" />
            {chosen.length === 0 ? "Select at least one item" : `Download ${countLabel(chosen.length, "item")}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
