"use client";

import { useState } from "react";
import { ArrowDownToLine, CircleAlert, CircleCheck, CircleX, Download, Film, ImageIcon, LayoutGrid, LoaderCircle, Plus, RotateCw } from "lucide-react";
import type { ApiError, JobView, MediaItem } from "@/types";
import { isActiveStatus } from "@/types";
import { Button } from "@/components/ui/button";
import { DownloadProgress } from "./download-progress";
import { SaveHint } from "./download-panel";
import { MediaPickerDialog } from "./media-picker-dialog";
import { formatBytes } from "@/lib/shared/format";
import { countLabel, describeMediaCounts } from "@/lib/shared/media";

interface MediaPostPanelProps {
  media: MediaItem[];
  fileTtlMinutes: number | null;
  job: JobView | null;
  starting: boolean;
  startError: ApiError | null;
  reconnecting: boolean;
  onStart: (items: number[]) => void;
  onCancel: () => void;
  onSaveClick: () => void;
  onSaveAll: () => void;
  /** Clears the finished job so other items can be chosen. */
  onChooseAgain: () => void;
  onReanalyze: () => void;
  onReset: () => void;
}

/** Download area for a photo post or a post with several items (e.g. an Instagram carousel). */
export function MediaPostPanel(props: MediaPostPanelProps) {
  const { media, fileTtlMinutes, job, starting, startError, reconnecting } = props;
  const multiple = media.length > 1;
  const [selected, setSelected] = useState(() => new Set(media.map((item) => item.index)));
  // A post with several items opens the picker right away; everything starts selected.
  const [pickerOpen, setPickerOpen] = useState(multiple);
  const chosen = media.filter((item) => selected.has(item.index));
  const busy = starting || Boolean(job && isActiveStatus(job.status));

  const start = () => {
    if (chosen.length === 0) return;
    setPickerOpen(false);
    props.onStart(chosen.map((item) => item.index));
  };

  const chooseAgain = () => {
    props.onChooseAgain();
    setPickerOpen(true);
  };

  return (
    <section aria-labelledby="media-download-title" className="panel animate-fade-up p-4 sm:p-5">
      <h2 id="media-download-title" className="text-[15px] font-semibold">
        Download
      </h2>
      <p className="mt-1 text-[13px] text-muted-foreground">
        {multiple ? `This post has ${countLabel(media.length, "item")}: ${describeMediaCounts(media)}.` : `This post is ${describeMediaCounts(media)}.`}
      </p>

      <div className="mt-4">
        {!job && (
          <>
            {startError && (
              <div role="alert" className="mb-3 flex gap-2.5 rounded-xl border border-destructive/30 bg-destructive/8 p-3 text-[13px]">
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
                <div className="min-w-0">
                  <p>{startError.message}</p>
                  {startError.code === "analysis_expired" && (
                    <Button variant="link" className="mt-1 h-auto p-0 text-[13px]" onClick={props.onReanalyze}>
                      Analyze the link again
                    </Button>
                  )}
                </div>
              </div>
            )}
            <div className={multiple ? "grid gap-2 sm:grid-cols-2" : "grid"}>
              {multiple && (
                <Button variant="outline" size="2xl" disabled={busy} onClick={() => setPickerOpen(true)}>
                  <LayoutGrid data-icon="inline-start" aria-hidden="true" />
                  Choose items ({selected.size}/{media.length})
                </Button>
              )}
              <Button size="2xl" disabled={busy || chosen.length === 0} onClick={start}>
                {starting ? <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" /> : <Download data-icon="inline-start" aria-hidden="true" />}
                {starting ? "Starting…" : `Download ${multiple ? countLabel(chosen.length, "item") : media[0].kind}`}
              </Button>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-subtle">
              {multiple ? "Each item is saved as its own file, one after another. " : ""}
              {`Files are prepared on the server, then your browser saves them.${fileTtlMinutes ? ` They are deleted after ${fileTtlMinutes} minutes.` : ""}`}
            </p>
          </>
        )}

        {job && isActiveStatus(job.status) && <DownloadProgress job={job} reconnecting={reconnecting} onCancel={props.onCancel} />}

        {job?.status === "ready" && job.files && (
          <div className="animate-fade-up">
            <div className="flex gap-3 rounded-xl border border-success/25 bg-success/8 p-3.5">
              <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {job.delivered ? "Sent to your browser" : job.files.length > 1 ? `${countLabel(job.files.length, "file")} ready` : "Your file is ready"}
                </p>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  {job.files.length > 1
                    ? "They save one after another. If your browser asks, allow multiple downloads, or save each file below."
                    : "Saving should start automatically. If it didn’t, tap Save."}
                </p>
              </div>
            </div>

            <ul className="mt-3 divide-y rounded-xl border">
              {job.files.map((file) => {
                const KindIcon = file.kind === "video" ? Film : ImageIcon;
                return (
                  <li key={file.index} className="flex items-center gap-3 py-2 pr-2 pl-3.5">
                    <KindIcon className="size-4 shrink-0 text-subtle" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium" title={file.fileName}>
                        {file.fileName}
                      </p>
                      <p className="text-xs text-subtle tabular-nums">{formatBytes(file.fileSize)}</p>
                    </div>
                    {file.delivered && <CircleCheck className="size-4 shrink-0 text-success" aria-label="Saved" />}
                    <Button asChild variant="outline" size="lg">
                      <a href={file.fileUrl} download onClick={props.onSaveClick}>
                        <ArrowDownToLine data-icon="inline-start" aria-hidden="true" />
                        Save
                      </a>
                    </Button>
                  </li>
                );
              })}
            </ul>

            {job.files.length > 1 && (
              <Button size="2xl" className="mt-3 w-full" onClick={props.onSaveAll}>
                <ArrowDownToLine data-icon="inline-start" aria-hidden="true" />
                Save all {job.files.length} files
              </Button>
            )}
            <SaveHint />
          </div>
        )}

        {job && (job.status === "failed" || job.status === "cancelled" || job.status === "expired") && (
          <div className="animate-fade-up">
            <div
              role={job.status === "failed" ? "alert" : "status"}
              className={job.status === "failed" ? "flex gap-3 rounded-xl border border-destructive/30 bg-destructive/8 p-3.5" : "flex gap-3 rounded-xl border bg-secondary p-3.5"}
            >
              <CircleX className={job.status === "failed" ? "mt-0.5 size-5 shrink-0 text-destructive" : "mt-0.5 size-5 shrink-0 text-muted-foreground"} aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {job.status === "failed" ? "Couldn’t prepare this file" : job.status === "cancelled" ? "Download cancelled" : "This file has expired"}
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                  {job.status === "failed"
                    ? job.error?.message
                    : job.status === "cancelled"
                      ? "Processing was stopped and partial files were deleted."
                      : "It was deleted from the server. Prepare it again to download."}
                </p>
              </div>
            </div>
            <Button size="xl" className="mt-3 w-full" disabled={chosen.length === 0} onClick={start}>
              <RotateCw data-icon="inline-start" aria-hidden="true" />
              {job.status === "expired" ? "Prepare again" : "Retry"}
            </Button>
          </div>
        )}

        {job && !isActiveStatus(job.status) && (
          <div className={multiple ? "mt-2 grid grid-cols-2 gap-2" : "mt-2 grid"}>
            {multiple && (
              <Button variant="outline" size="xl" onClick={chooseAgain}>
                <LayoutGrid data-icon="inline-start" aria-hidden="true" />
                Choose other items
              </Button>
            )}
            <Button variant="ghost" size="xl" onClick={props.onReset}>
              <Plus data-icon="inline-start" aria-hidden="true" />
              New link
            </Button>
          </div>
        )}
      </div>

      {multiple && (
        <MediaPickerDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          items={media}
          selected={selected}
          onSelectedChange={setSelected}
          onDownload={start}
        />
      )}
    </section>
  );
}
