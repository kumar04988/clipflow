"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Hero } from "./hero";
import { UrlInput } from "./url-input";
import { SupportedPlatforms } from "./supported-platforms";
import { EngineNotice } from "./engine-notice";
import { IdleState } from "./idle-state";
import { AnalyzingState } from "./analyzing-state";
import { AnalysisError } from "./analysis-error";
import { VideoPreview } from "./video-preview";
import { QualitySelector } from "./quality-selector";
import { DownloadPanel } from "./download-panel";
import { MediaPostPanel } from "./media-post-panel";
import { LinkFromQuery } from "./link-from-query";
import { useVideoInfo } from "@/hooks/use-video-info";
import { useDownloadJob } from "@/hooks/use-download-job";
import { useEngineStatus } from "@/hooks/use-engine-status";
import { validateUrl } from "@/lib/shared/url";
import { streamDownloadUrl } from "@/lib/client/api";

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function HomeView() {
  const engine = useEngineStatus();
  const video = useVideoInfo();
  const download = useDownloadJob();
  const [inputValue, setInputValue] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const { analyze: runAnalysis, reset: resetVideo, select } = video;
  const { reset: resetDownload, start: startDownload, isActive } = download;
  const selected = video.selectedOption;
  const streamUrl = video.info && selected?.streamable ? streamDownloadUrl(video.info.analysisId, selected.id) : null;

  const analyze = useCallback(
    (rawUrl: string, preferredOptionId: string | null = null) => {
      const result = validateUrl(rawUrl);
      if (!result.ok) {
        setInputValue(rawUrl);
        setInputError(result.error);
        return;
      }
      setInputValue(result.url);
      setInputError(null);
      resetDownload(); // a new video never inherits the previous job or selection
      void runAnalysis(result.url, preferredOptionId);
    },
    [resetDownload, runAnalysis],
  );

  // On phones the results start below the fold; bring them into view.
  useEffect(() => {
    if (video.status === "idle") return;
    const element = resultsRef.current;
    if (element && element.getBoundingClientRect().top > window.innerHeight * 0.65) {
      element.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    }
  }, [video.status, video.requestId]);

  const job = download.job;
  const jobStatus = job?.status;
  const severalFiles = (job?.files?.length ?? 0) > 1;
  useEffect(() => {
    if (jobStatus !== "ready") return;
    toast.success(severalFiles ? "Your files are ready" : "Your file is ready", {
      description: severalFiles ? "Saving them one by one. If your browser asks, allow multiple downloads." : "Saving to your device…",
    });
  }, [jobStatus, severalFiles]);

  const focusInput = () => {
    const input = inputRef.current;
    if (!input) return;
    input.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
    input.focus({ preventScroll: true });
    input.select();
  };

  const resetAll = () => {
    resetDownload();
    resetVideo();
    setInputValue("");
    setInputError(null);
    focusInput();
  };

  const selectOption = (optionId: string) => {
    if (isActive) return;
    if (job) resetDownload(); // a finished/failed job belongs to the previous choice
    select(optionId);
  };

  const startOption = (optionId: string) => {
    if (!video.info) return;
    select(optionId);
    resetDownload();
    void startDownload(video.info.analysisId, { optionId });
  };

  const startItems = (items: number[]) => {
    if (!video.info) return;
    resetDownload();
    void startDownload(video.info.analysisId, { items });
  };

  return (
    <>
      <Suspense fallback={null}>
        <LinkFromQuery onLink={analyze} />
      </Suspense>

      <Hero>
        <UrlInput
          inputRef={inputRef}
          value={inputValue}
          error={inputError}
          isAnalyzing={video.status === "analyzing"}
          onChange={(value) => {
            setInputValue(value);
            setInputError(null);
          }}
          onSubmit={() => analyze(inputValue)}
        />
        <div className="mt-5">
          <SupportedPlatforms />
        </div>
      </Hero>

      <div ref={resultsRef} className="gutter-x mx-auto w-full max-w-6xl scroll-mt-20 pb-16">
        <EngineNotice status={engine} />

        {video.status === "idle" && <IdleState />}
        {video.status === "analyzing" && <AnalyzingState key={video.requestId} url={video.url} />}
        {video.status === "error" && video.error && (
          <AnalysisError error={video.error} url={video.url} onRetry={() => analyze(video.url)} onEditUrl={focusInput} />
        )}

        {video.status === "ready" && video.info && (
          <div className="grid gap-4 lg:gap-5">
            <VideoPreview info={video.info} onChangeUrl={focusInput} onReset={resetAll} />
            {video.info.media ? (
              <MediaPostPanel
                key={video.info.analysisId}
                media={video.info.media}
                fileTtlMinutes={engine?.limits.fileTtlMinutes ?? null}
                job={job}
                starting={download.starting}
                startError={download.startError}
                reconnecting={download.reconnecting}
                onStart={startItems}
                onCancel={() => void download.cancel()}
                onSaveClick={download.markSaving}
                onSaveAll={() => job && download.save(job)}
                onChooseAgain={resetDownload}
                onReanalyze={() => analyze(video.info?.url ?? video.url)}
                onReset={resetAll}
              />
            ) : (
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-5">
              <QualitySelector
                options={video.info.options}
                selected={selected}
                locked={isActive || download.starting}
                blockedReason={video.info.blockedReason}
                onSelect={selectOption}
              />
              <div className="lg:sticky lg:top-20">
                <DownloadPanel
                  options={video.info.options}
                  selected={selected}
                  streamUrl={streamUrl}
                  streamed={Boolean(selected && download.streamedOptionId === selected.id)}
                  sourceName={video.info.platform.name}
                  blockedReason={video.info.blockedReason}
                  fileTtlMinutes={engine?.limits.fileTtlMinutes ?? null}
                  job={job}
                  starting={download.starting}
                  startError={download.startError}
                  reconnecting={download.reconnecting}
                  onStart={startOption}
                  onStreamStart={download.markStreamed}
                  onCancel={() => void download.cancel()}
                  onSaveClick={download.markSaving}
                  onAnotherQuality={resetDownload}
                  onReanalyze={() => analyze(video.info?.url ?? video.url, video.selectedOptionId)}
                  onReset={resetAll}
                />
              </div>
            </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
