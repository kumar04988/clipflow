import { FEATURED_PLATFORMS, PLATFORM_NAMES } from "@/lib/shared/platforms";
import { PlatformIcon } from "@/components/shared/platform-icon";

/** A compact, non-interactive list of the main supported platforms. */
export function SupportedPlatforms() {
  return (
    <div className="flex flex-col items-center gap-2.5 text-center sm:flex-row sm:justify-center">
      <span className="text-xs text-subtle">Works with</span>
      <ul className="flex flex-wrap justify-center gap-1.5" aria-label="Supported platforms">
        {FEATURED_PLATFORMS.map((id) => (
          <li key={id} className="inline-flex h-7 items-center gap-1.5 rounded-full border bg-card/60 pr-2.5 pl-1 text-xs font-medium text-muted-foreground">
            <PlatformIcon platformId={id} size="sm" className="rounded-full" />
            {id === "x" ? "X" : PLATFORM_NAMES[id]}
          </li>
        ))}
        <li className="inline-flex h-7 items-center rounded-full border border-dashed px-2.5 text-xs text-subtle">+ many more</li>
      </ul>
    </div>
  );
}
