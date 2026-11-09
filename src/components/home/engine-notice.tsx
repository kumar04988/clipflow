import { TriangleAlert } from "lucide-react";
import type { EngineStatus } from "@/types";

/** Warns honestly when this server can't (fully) download, e.g. when deployed without yt-dlp/FFmpeg. */
export function EngineNotice({ status }: { status: EngineStatus | null }) {
  if (!status?.message) return null;
  return (
    <div role="status" className="mb-4 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/8 p-3.5 text-sm">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
      <div>
        <p className="font-medium">{status.ready ? "Limited download support" : "Downloads are unavailable on this server"}</p>
        <p className="mt-0.5 text-[13px] text-muted-foreground">{status.message} See the README for setup instructions.</p>
      </div>
    </div>
  );
}
