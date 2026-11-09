import type { ReactNode } from "react";
import { Globe } from "lucide-react";
import type { PlatformId, PlatformInfo } from "@/types";
import { cn } from "@/lib/utils";

// Simple, generic glyphs that hint at each platform (not official logos).
const GLYPHS: Partial<Record<PlatformId, ReactNode>> = {
  youtube: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="3.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10.5 9.5v5l4.2-2.5-4.2-2.5Z" fill="currentColor" />
    </>
  ),
  instagram: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="4.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="3.6" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="16.6" cy="7.4" r="1.1" fill="currentColor" />
    </>
  ),
  facebook: (
    <path
      d="M13.4 20v-6.6h2.3l.4-2.8h-2.7V8.9c0-.8.3-1.4 1.4-1.4h1.4V5.1c-.3 0-1.1-.1-2-.1-2 0-3.4 1.2-3.4 3.5v2.1H8.5v2.8h2.3V20h2.6Z"
      fill="currentColor"
    />
  ),
  x: <path d="M5.5 5h3.6l9.4 14h-3.6L5.5 5Zm13 0-5.4 6.1m-2.3 2.7L5.5 19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />,
  tiktok: (
    <path
      d="M14 4.5v9.8a3.3 3.3 0 1 1-3.3-3.3M14 4.5c.4 2.3 2.1 3.9 4.5 4.1"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  vimeo: (
    <path
      d="M4.5 9.2c1.8-1.6 2.9-2.4 3.6-2.4 1.1 0 1.6 1.4 2.1 3.6.5 2.4.9 4.6 1.7 4.6.6 0 1.9-1.6 3.6-4.6 1-1.8.3-3.4-1.4-2.6.9-3 6.2-3.6 5.5.8-.6 3.3-5.2 9-7.3 9-2 0-2.6-3.3-3.3-6-.5-2-.9-3.2-1.5-3.2-.3 0-.8.3-1.6.9l-1.4-.1Z"
      fill="currentColor"
    />
  ),
};

const TILE_STYLES: Partial<Record<PlatformId, string>> = {
  youtube: "bg-[#ff0033] text-white",
  instagram: "bg-[linear-gradient(135deg,#feda75_0%,#fa7e1e_25%,#d62976_55%,#962fbf_80%,#4f5bd5_100%)] text-white",
  facebook: "bg-[#1877f2] text-white",
  x: "bg-black text-white ring-1 ring-inset ring-white/15",
  tiktok: "bg-black text-white ring-1 ring-inset ring-white/15",
  vimeo: "bg-[#17a8e3] text-white",
};

const SIZES = {
  sm: { tile: "size-5 rounded-[6px]", icon: "size-3.5" },
  md: { tile: "size-7 rounded-lg", icon: "size-[18px]" },
  lg: { tile: "size-9 rounded-[10px]", icon: "size-5" },
};

export function PlatformIcon({ platformId, size = "md", className }: { platformId: PlatformId; size?: keyof typeof SIZES; className?: string }) {
  const { tile, icon } = SIZES[size];
  const glyph = GLYPHS[platformId];
  return (
    <span aria-hidden="true" className={cn("grid shrink-0 place-items-center", tile, TILE_STYLES[platformId] ?? "bg-surface-3 text-muted-foreground", className)}>
      {glyph ? (
        <svg viewBox="0 0 24 24" fill="none" className={icon}>
          {glyph}
        </svg>
      ) : (
        <Globe className={icon} strokeWidth={1.8} />
      )}
    </span>
  );
}

export function PlatformBadge({ platform, className }: { platform: PlatformInfo; className?: string }) {
  return (
    <span className={cn("inline-flex max-w-full items-center gap-2 rounded-full border bg-secondary py-0.5 pr-2.5 pl-0.5 text-xs font-medium", className)}>
      <PlatformIcon platformId={platform.id} size="sm" className="rounded-full" />
      <span className="truncate">{platform.name}</span>
    </span>
  );
}
