import Link from "next/link";
import { Ban, CircleAlert, Globe, Lock, PencilLine, RotateCw, ShieldAlert, WifiOff } from "lucide-react";
import type { ApiError } from "@/types";
import { Button } from "@/components/ui/button";
import { formatDisplayUrl } from "@/lib/shared/url";

const ICONS: Record<string, typeof CircleAlert> = {
  unsupported_url: Globe,
  playlist: Ban,
  live_stream: Ban,
  private_video: Lock,
  members_only: Lock,
  age_restricted: Lock,
  login_required: Lock,
  blocked_destination: ShieldAlert,
  network_error: WifiOff,
  timeout: WifiOff,
};

const TITLES: Record<string, string> = {
  unsupported_url: "No downloadable video found",
  playlist: "That’s not a single video",
  live_stream: "Live videos can’t be downloaded",
  private_video: "This video is private",
  members_only: "Members-only video",
  age_restricted: "Age-restricted video",
  login_required: "Sign-in required",
  not_found: "Video not found",
  blocked_destination: "Link not allowed",
  platform_blocked: "The platform blocked this request",
  rate_limited: "Too many requests",
  engine_unavailable: "Downloads unavailable",
};

export function AnalysisError({ error, url, onRetry, onEditUrl }: { error: ApiError; url: string; onRetry: () => void; onEditUrl: () => void }) {
  const Icon = ICONS[error.code] ?? CircleAlert;
  return (
    <div role="alert" className="panel flex animate-fade-up flex-col items-center px-5 py-10 text-center sm:px-10">
      <span className="grid size-12 place-items-center rounded-2xl bg-warning/12 text-warning">
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-lg font-semibold tracking-tight">{TITLES[error.code] ?? "We couldn’t analyze this link"}</h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-pretty text-muted-foreground">{error.message}</p>
      {url && (
        <p className="mt-4 max-w-full truncate rounded-lg border bg-secondary px-3 py-1.5 font-mono text-xs text-subtle" title={url}>
          {formatDisplayUrl(url)}
        </p>
      )}
      <div className="mt-6 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
        <Button size="xl" onClick={onEditUrl}>
          <PencilLine data-icon="inline-start" aria-hidden="true" />
          Edit link
        </Button>
        <Button size="xl" variant="outline" onClick={onRetry}>
          <RotateCw data-icon="inline-start" aria-hidden="true" />
          Try again
        </Button>
      </div>
      <Link href="/about#supported" className="mt-4 text-[13px] font-medium text-brand underline-offset-4 hover:underline">
        See supported sites and link formats
      </Link>
    </div>
  );
}
