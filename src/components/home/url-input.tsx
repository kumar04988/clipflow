"use client";

import { useId, useMemo, type RefObject } from "react";
import { CircleAlert, ClipboardPaste, Link2, LoaderCircle, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PlatformIcon } from "@/components/shared/platform-icon";
import { validateUrl } from "@/lib/shared/url";
import { detectPlatform } from "@/lib/shared/platforms";
import { cn } from "@/lib/utils";

interface UrlInputProps {
  value: string;
  error: string | null;
  isAnalyzing: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

export function UrlInput({ value, error, isAnalyzing, inputRef, onChange, onSubmit }: UrlInputProps) {
  const inputId = useId();
  const messageId = useId();

  // Instant feedback while typing; the server makes the final decision.
  const detected = useMemo(() => {
    const result = validateUrl(value);
    return result.ok ? detectPlatform(result.url) : null;
  }, [value]);

  const handlePaste = async () => {
    try {
      if (!navigator.clipboard?.readText) throw new Error("unsupported");
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) {
        toast.info("Your clipboard is empty", { description: "Copy a video link first, then try again." });
        return;
      }
      onChange(text);
    } catch {
      toast.error("Couldn’t read the clipboard", {
        description: "Your browser blocked clipboard access. Tap the field and paste the link yourself.",
      });
    }
    inputRef.current?.focus();
  };

  return (
    <form
      // Works even before JavaScript has loaded (slow phones): the browser goes to /?url=…,
      // which the page picks up and analyzes once it's ready.
      action="/"
      method="get"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!isAnalyzing) onSubmit();
      }}
    >
      <label htmlFor={inputId} className="sr-only">
        Video link
      </label>
      <div
        className={cn(
          "panel flex flex-col gap-2 p-2 transition-[border-color,box-shadow] sm:flex-row sm:items-center",
          "focus-within:border-primary/60 focus-within:ring-4 focus-within:ring-primary/12",
          error && "border-destructive/60 focus-within:border-destructive/70 focus-within:ring-destructive/12",
        )}
      >
        <div className="relative flex min-w-0 flex-1 items-center">
          <span className="pointer-events-none absolute left-3 grid place-items-center">
            {detected && detected.id !== "other" ? (
              <PlatformIcon platformId={detected.id} size="sm" />
            ) : (
              <Link2 className="size-[18px] text-subtle" aria-hidden="true" />
            )}
          </span>
          <input
            ref={inputRef}
            id={inputId}
            name="url"
            type="url"
            inputMode="url"
            enterKeyHint="go"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="Paste a video link — YouTube, Instagram, TikTok…"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby={messageId}
            // 16px on phones stops iOS Safari from zooming in when the field is focused.
            className="h-12 w-full min-w-0 bg-transparent pr-11 pl-10 text-base text-foreground outline-none placeholder:text-subtle focus-visible:outline-none sm:text-[15px]"
          />
          {value && (
            <button
              type="button"
              onClick={() => {
                onChange("");
                inputRef.current?.focus();
              }}
              aria-label="Clear link"
              className="absolute right-1.5 grid size-9 place-items-center rounded-md text-subtle transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="flex gap-2">
          <Button type="button" variant="outline" size="2xl" onClick={handlePaste} className="flex-1 sm:flex-none">
            <ClipboardPaste data-icon="inline-start" aria-hidden="true" />
            Paste
          </Button>
          <Button type="submit" size="2xl" disabled={isAnalyzing} className="flex-[2] sm:min-w-40 sm:flex-none">
            {isAnalyzing && <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />}
            {isAnalyzing ? "Analyzing…" : "Analyze Video"}
          </Button>
        </div>
      </div>

      <div id={messageId} className="mt-2.5 min-h-5 px-1 text-[13px]">
        {error ? (
          <p role="alert" className="flex items-start gap-2 text-destructive">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        ) : detected ? (
          <p className="flex items-center gap-2 text-muted-foreground">
            <PlatformIcon platformId={detected.id} size="sm" />
            {detected.id === "other" ? (
              <span>
                <span className="font-medium text-foreground">{detected.name}</span> — we’ll check whether this site is supported
              </span>
            ) : (
              <span>
                <span className="font-medium text-foreground">{detected.name}</span> link detected
              </span>
            )}
          </p>
        ) : (
          <p className="text-subtle">Press Enter to analyze. Only download videos you own or have permission to use.</p>
        )}
      </div>
    </form>
  );
}
