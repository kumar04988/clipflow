"use client";

import { useEffect, useState } from "react";
import { ArrowDownToLine, CircleAlert, CircleCheck, CircleX, Clock, Download, LoaderCircle, Plus, RefreshCw, RotateCcw, RotateCw, Smartphone } from "lucide-react";
import type { ApiError, JobView, QualityOption } from "@/types";
import { Button } from "@/components/ui/button";
import { DownloadProgress } from "./download-progress";
import { formatBytes, formatSize } from "@/lib/shared/format";
import { describeOption, findLowerAlternative } from "@/lib/shared/quality";
import { isAppleMobile } from "@/lib/client/api";

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-3.5 py-2.5 text-[13px]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function minutesLeft(iso: string | null): number | null {
  if (!iso) return null;
  return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60_000));
}

export function SaveHint() {
  const [apple, setApple] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setApple(isAppleMobile()), []);
  return (
    <p className="mt-3 flex gap-2 text-xs leading-relaxed text-subtle">
      <Smartphone className="mt-px size-3.5 shrink-0" aria-hidden="true" />
      {apple
        ? "On iPhone or iPad, tap “Download” if Safari asks, then find the file in the Files app › Downloads. If the video opens instead, tap Share › Save to Files."
        : "Your browser saves the file to its Downloads folder. On Android, check the download notification. If the video opens in a tab instead, use the browser menu to download it."}
    </p>
  );
}

interface DownloadPanelProps {
  options: QualityOption[];
  selected: QualityOption | null;
  /** Set when the selected quality can be streamed straight into the browser's download. */
  streamUrl: string | null;
  streamed: boolean;
  sourceName: string;
  blockedReason: string | null;
  fileTtlMinutes: number | null;
  job: JobView | null;
  starting: boolean;
  startError: ApiError | null;
  reconnecting: boolean;
  onStart: (optionId: string) => void;
  onStreamStart: (optionId: string) => void;
  onCancel: () => void;
  onSaveClick: () => void;
  onAnotherQuality: () => void;
  onReanalyze: () => void;
  onReset: () => void;
}

export function DownloadPanel(props: DownloadPanelProps) {
  const { options, selected, streamUrl, streamed, sourceName, blockedReason, fileTtlMinutes, job, starting, startError, reconnecting } = props;
  const streamHref = streamUrl && selected?.available && !blockedReason ? streamUrl : null;
  const lower = job && (job.status === "failed" || job.status === "cancelled") ? findLowerAlternative(options, job.optionId) : null;

  // While a job exists, the summary shows what is being prepared; otherwise the current selection.
  const jobOption = job ? options.find((option) => option.id === job.optionId) ?? null : null;
  const summaryOption = jobOption ?? selected;

  return (
    <section aria-labelledby="download-title" className="panel animate-fade-up p-4 [animation-delay:120ms] sm:p-5">
      <h2 id="download-title" className="text-[15px] font-semibold">
        Download
      </h2>

      {/* Re-keyed on selection so it briefly highlights whenever the choice changes. */}
      <dl key={summaryOption?.id ?? "none"} className="mt-4 animate-highlight divide-y rounded-xl border">
        <SummaryRow label={summaryOption?.kind === "audio" ? "Quality" : "Resolution"} value={summaryOption ? describeOption(summaryOption) : "—"} />
        <SummaryRow label="Format" value={summaryOption ? `${summaryOption.container.toUpperCase()}${summaryOption.videoCodec ? ` · ${summaryOption.videoCodec}` : ""}` : "—"} />
        <SummaryRow
          label="Audio"
          value={
            !summaryOption
              ? "—"
              : summaryOption.hasAudio === false
                ? "None"
                : summaryOption.hasAudio === null
                  ? "Not reported"
                  : summaryOption.audioCodec ?? "Included"
          }
        />
        <SummaryRow label={job?.fileSize ? "File size" : "Estimated size"} value={job?.fileSize ? formatBytes(job.fileSize) : formatSize(summaryOption?.size)} />
        <SummaryRow label="Source" value={sourceName} />
      </dl>

      <div className="mt-4">
        {!job && streamed && streamHref && selected && (
          <div className="animate-fade-up">
            <div role="status" className="flex gap-3 rounded-xl border border-success/25 bg-success/8 p-3.5">
              <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">Download started in your browser</p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                  Check your browser’s downloads. The file is sent while the server makes it, so your browser may not show a percentage or time left.
                </p>
              </div>
            </div>
            <SaveHint />
            <Button asChild variant="outline" size="xl" className="mt-3 w-full">
              <a href={streamHref} download>
                <ArrowDownToLine data-icon="inline-start" aria-hidden="true" />
                Download again
              </a>
            </Button>
            <p className="mt-3 text-xs leading-relaxed text-subtle">
              Didn’t start, or it failed?{" "}
              <Button variant="link" className="h-auto p-0 text-xs" onClick={() => props.onStart(selected.id)}>
                Prepare it on the server instead
              </Button>
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="outline" size="xl" onClick={props.onAnotherQuality}>
                <RefreshCw data-icon="inline-start" aria-hidden="true" />
                Other quality
              </Button>
              <Button variant="ghost" size="xl" onClick={props.onReset}>
                <Plus data-icon="inline-start" aria-hidden="true" />
                New video
              </Button>
            </div>
          </div>
        )}

        {!job && !(streamed && streamHref) && (
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
            {streamHref && selected ? (
              // A real link, not a script: mobile browsers hand it straight to their download manager.
              // No `download` attribute: the server's "attachment" header saves the file, and an error opens as a
              // readable page instead of being saved as a broken file named "stream".
              <Button asChild size="2xl" className="w-full">
                <a href={streamHref} onClick={() => props.onStreamStart(selected.id)}>
                  <Download data-icon="inline-start" aria-hidden="true" />
                  Download
                </a>
              </Button>
            ) : (
              <Button
                size="2xl"
                className="w-full"
                disabled={!selected?.available || starting || Boolean(blockedReason)}
                onClick={() => selected && props.onStart(selected.id)}
              >
                {starting ? <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" /> : <Download data-icon="inline-start" aria-hidden="true" />}
                {starting ? "Starting…" : "Download"}
              </Button>
            )}
            <p className="mt-3 text-xs leading-relaxed text-subtle">
              {!selected
                ? "Choose a quality to continue."
                : streamHref
                  ? "Your browser starts saving right away, while the server makes the file. Nothing is stored on the server."
                  : `The file is prepared on the server, then your browser saves it.${fileTtlMinutes ? ` Files are deleted after ${fileTtlMinutes} minutes.` : ""}`}
            </p>
          </>
        )}

        {job && (job.status === "queued" || job.status === "preparing" || job.status === "downloading" || job.status === "merging" || job.status === "converting" || job.status === "finalizing") && (
          <DownloadProgress job={job} reconnecting={reconnecting} onCancel={props.onCancel} />
        )}

        {job?.status === "ready" && job.fileUrl && (
          <div className="animate-fade-up">
            <div className="flex gap-3 rounded-xl border border-success/25 bg-success/8 p-3.5">
              <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">{job.delivered ? "File sent to your browser" : "Your file is ready"}</p>
                <p className="mt-0.5 truncate text-[13px] text-muted-foreground" title={job.fileName ?? undefined}>
                  {job.fileName} · {formatBytes(job.fileSize)}
                </p>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  {job.delivered ? "The whole file was transferred. Check your downloads." : "Saving should start automatically. If it didn’t, tap Save file."}
                </p>
              </div>
            </div>
            <Button asChild size="2xl" className="mt-3 w-full">
              <a href={job.fileUrl} download onClick={props.onSaveClick}>
                <ArrowDownToLine data-icon="inline-start" aria-hidden="true" />
                {job.delivered ? "Save again" : "Save file"}
              </a>
            </Button>
            <SaveHint />
            {minutesLeft(job.expiresAt) !== null && (
              <p className="mt-2 flex items-center gap-2 text-xs text-subtle">
                <Clock className="size-3.5" aria-hidden="true" />
                Available on the server for about {minutesLeft(job.expiresAt)} more minutes.
              </p>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="outline" size="xl" onClick={props.onAnotherQuality}>
                <RefreshCw data-icon="inline-start" aria-hidden="true" />
                Other quality
              </Button>
              <Button variant="ghost" size="xl" onClick={props.onReset}>
                <Plus data-icon="inline-start" aria-hidden="true" />
                New video
              </Button>
            </div>
          </div>
        )}

        {job && (job.status === "failed" || job.status === "cancelled" || job.status === "expired") && (
          <div className="animate-fade-up">
            <div
              role={job.status === "failed" ? "alert" : "status"}
              className={
                job.status === "failed"
                  ? "flex gap-3 rounded-xl border border-destructive/30 bg-destructive/8 p-3.5"
                  : "flex gap-3 rounded-xl border bg-secondary p-3.5"
              }
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
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Button size="xl" onClick={() => props.onStart(job.optionId)}>
                <RotateCw data-icon="inline-start" aria-hidden="true" />
                {job.status === "expired" ? "Prepare again" : "Retry"}
              </Button>
              {lower ? (
                <Button variant="outline" size="xl" onClick={() => props.onStart(lower.id)}>
                  Try {describeOption(lower)}
                </Button>
              ) : (
                <Button variant="outline" size="xl" onClick={props.onReset}>
                  <RotateCcw data-icon="inline-start" aria-hidden="true" />
                  Start over
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
