"use client";

import { useMemo } from "react";
import { AudioLines, CircleSlash, Film, Info, Lock, VolumeX } from "lucide-react";
import type { QualityOption } from "@/types";
import { formatSize } from "@/lib/shared/format";
import { groupByResolution, selectDefaultOption, sortAudioOptions } from "@/lib/shared/quality";
import { cn } from "@/lib/utils";

const BADGE_STYLES: Record<string, string> = {
  "8K": "bg-primary/15 text-brand",
  "4K": "bg-primary/15 text-brand",
  "2K": "bg-primary/15 text-brand",
  "Full HD": "bg-foreground/10 text-foreground",
  HD: "bg-foreground/8 text-muted-foreground",
  SD: "bg-foreground/6 text-muted-foreground",
};

/** Row/chip styles around a visually hidden native radio (keeps keyboard + screen reader behaviour). */
function optionClasses(checked: boolean, disabled: boolean) {
  return cn(
    "relative flex items-center rounded-xl border transition-[background-color,border-color,box-shadow] duration-150",
    "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
    checked && "border-primary bg-primary/8 ring-1 ring-primary",
    !checked && !disabled && "hover:border-border-strong hover:bg-secondary/70",
    disabled && "cursor-not-allowed opacity-50",
  );
}

function RadioDot({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn("grid size-4 shrink-0 place-items-center rounded-full border transition-colors", checked ? "border-primary bg-primary" : "border-border-strong bg-card")}
    >
      {checked && <span className="size-1.5 rounded-full bg-white" />}
    </span>
  );
}

function SectionLabel({ icon: Icon, children }: { icon: typeof Film; children: React.ReactNode }) {
  return (
    <span className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.08em] text-subtle uppercase">
      <Icon className="size-3.5" aria-hidden="true" />
      {children}
    </span>
  );
}

function codecLine(option: QualityOption): string {
  const audio = option.hasAudio === false ? "no audio" : option.audioCodec ?? (option.hasAudio === null ? "audio not reported" : "audio");
  return [option.videoCodec ?? "Video", audio].join(" + ");
}

interface QualitySelectorProps {
  options: QualityOption[];
  selected: QualityOption | null;
  locked: boolean;
  blockedReason: string | null;
  onSelect: (optionId: string) => void;
}

export function QualitySelector({ options, selected, locked, blockedReason, onSelect }: QualitySelectorProps) {
  const resolutions = useMemo(() => groupByResolution(options), [options]);
  const audioOptions = useMemo(() => sortAudioOptions(options), [options]);
  const highestHeight = useMemo(() => {
    const best = selectDefaultOption(options);
    return best?.kind === "video" ? best.height : null;
  }, [options]);

  const hasVideo = resolutions.length > 0;
  const hasAudio = audioOptions.length > 0;
  const selectedIsVideo = selected?.kind === "video";
  const preferredContainer = selectedIsVideo ? selected.container : "mp4";
  const containerOptions = selectedIsVideo ? (resolutions.find((group) => group.height === selected.height)?.options ?? []) : [];

  const chooseResolution = (height: number | null) => {
    const group = resolutions.find((candidate) => candidate.height === height);
    const pick =
      group?.options.find((option) => option.available && option.container === preferredContainer) ??
      group?.options.find((option) => option.available);
    if (pick) onSelect(pick.id);
  };

  return (
    <section aria-labelledby="quality-title" className="panel animate-fade-up p-4 [animation-delay:60ms] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div>
          <h2 id="quality-title" className="text-[15px] font-semibold">
            Choose quality
          </h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {blockedReason ??
              (hasVideo
                ? "Only formats this video really has are shown. The highest available is selected."
                : hasAudio
                  ? "This link has no video streams — only audio is available."
                  : "No downloadable formats were found for this video.")}
          </p>
        </div>
        {locked && (
          <span className="inline-flex items-center gap-1.5 pt-0.5 text-xs text-subtle">
            <Lock className="size-3.5" aria-hidden="true" />
            Locked while preparing
          </span>
        )}
      </div>

      {!hasVideo && !hasAudio && (
        <div className="mt-4 flex flex-col items-center rounded-xl border border-dashed px-4 py-10 text-center">
          <span className="grid size-10 place-items-center rounded-xl bg-secondary text-muted-foreground">
            <CircleSlash className="size-5" aria-hidden="true" />
          </span>
          <p className="mt-3 text-sm font-medium">No compatible formats</p>
          <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
            The platform didn’t offer any format this server can download (it may be protected or streaming-only).
          </p>
        </div>
      )}

      <fieldset disabled={locked} className="min-w-0">
        <legend className="sr-only">Quality options</legend>

        {hasVideo && (
          <div role="radiogroup" aria-label="Video resolution" className="mt-4">
            <SectionLabel icon={Film}>Video</SectionLabel>
            <div className="grid gap-2">
              {resolutions.map((group) => {
                const checked = selectedIsVideo && selected.height === group.height;
                const shown =
                  (checked ? selected : null) ??
                  group.options.find((option) => option.available && option.container === preferredContainer) ??
                  group.options.find((option) => option.available) ??
                  group.options[0];
                const disabled = !group.available;
                return (
                  <label key={group.height ?? "original"} className={cn(optionClasses(checked, disabled || locked), "gap-3 px-3.5 py-3")}>
                    <input
                      type="radio"
                      name="quality"
                      value={`video-${group.height ?? 0}`}
                      checked={checked}
                      disabled={disabled}
                      onChange={() => chooseResolution(group.height)}
                      className="sr-only"
                    />
                    <RadioDot checked={checked} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-[15px] font-semibold tabular-nums">{shown.label}</span>
                        {shown.badge && (
                          <span className={cn("rounded-md px-1.5 py-px text-[11px] font-semibold", BADGE_STYLES[shown.badge] ?? "bg-foreground/8")}>
                            {shown.badge}
                          </span>
                        )}
                        {shown.hdr && <span className="text-[11px] font-semibold text-warning">HDR</span>}
                        {shown.fps && <span className="text-xs text-subtle">{shown.fps} fps</span>}
                        {group.height === highestHeight && !disabled && <span className="text-[11px] font-medium text-brand">Highest available</span>}
                        {shown.hasAudio === false && (
                          <span className="inline-flex items-center gap-1 text-xs text-warning">
                            <VolumeX className="size-3" aria-hidden="true" />
                            No audio
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-subtle">
                        {disabled ? (
                          <span className="inline-flex items-center gap-1">
                            <Lock className="size-3" aria-hidden="true" />
                            {group.options[0].unavailableReason ?? "Unavailable"}
                          </span>
                        ) : (
                          codecLine(shown)
                        )}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-medium tabular-nums">{disabled ? "—" : formatSize(shown.size)}</span>
                      <span className="block text-[11px] text-subtle uppercase">{group.options.map((option) => option.container).join(" · ")}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {containerOptions.length > 0 && selected && (
          <div role="radiogroup" aria-label={`Format for ${selected.label}`} className="mt-4">
            <SectionLabel icon={Film}>Format for {selected.label}</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {containerOptions.map((option) => {
                const checked = option.id === selected.id;
                return (
                  <label key={option.id} className={cn(optionClasses(checked, !option.available || locked), "h-10 gap-2 rounded-lg px-3 text-[13px]")}>
                    <input
                      type="radio"
                      name="container"
                      value={option.id}
                      checked={checked}
                      disabled={!option.available}
                      onChange={() => onSelect(option.id)}
                      className="sr-only"
                    />
                    <span className="font-semibold uppercase">{option.container}</span>
                    <span className="text-subtle">{option.videoCodec}</span>
                    <span className="text-subtle tabular-nums">{option.available ? formatSize(option.size) : "Unavailable"}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {hasAudio && (
          <div role="radiogroup" aria-label="Audio only" className={cn("mt-5", hasVideo && "border-t pt-4")}>
            <SectionLabel icon={AudioLines}>Audio only</SectionLabel>
            <p className="-mt-1 mb-2.5 text-xs text-subtle">Sound without picture — separate from the video resolutions.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {audioOptions.map((option) => {
                const checked = selected?.id === option.id;
                return (
                  <label key={option.id} className={cn(optionClasses(checked, !option.available || locked), "gap-3 px-3.5 py-2.5")}>
                    <input
                      type="radio"
                      name="quality"
                      value={option.id}
                      checked={checked}
                      disabled={!option.available}
                      onChange={() => onSelect(option.id)}
                      className="sr-only"
                    />
                    <RadioDot checked={checked} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{option.label}</span>
                      <span className="block truncate text-xs text-subtle">
                        {option.reencodes ? "Converted" : "Original"}
                        {option.badge ? ` · ${option.badge}` : ""}
                      </span>
                    </span>
                    <span className="text-sm font-medium tabular-nums">{option.available ? formatSize(option.size) : "—"}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </fieldset>

      {selected && (
        <p className="mt-4 flex gap-2 rounded-lg bg-secondary px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          <Info className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          <span>
            {selected.compatibilityNote}
            {selected.requiresMerge && " Video and audio are downloaded separately and merged on the server without re-encoding."}
            {selected.size && !selected.size.exact && " Sizes marked ≈ are estimates."}
          </span>
        </p>
      )}

      <p className="sr-only" aria-live="polite">
        {selected ? `Selected ${selected.label}${selected.badge ? ` ${selected.badge}` : ""}, ${selected.container}, ${formatSize(selected.size)}.` : "No quality selected."}
      </p>
    </section>
  );
}
