import { connection } from "next/server";
import { CircleCheck, CircleX, Server } from "lucide-react";
import { getEngineStatus } from "@/lib/server/engineStatus";

function Row({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  const Icon = ok ? CircleCheck : CircleX;
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex items-center gap-1.5 font-medium">
        <Icon className={ok ? "size-4 text-success" : "size-4 text-destructive"} aria-hidden="true" />
        {value}
      </dd>
    </div>
  );
}

/** Live status of this server's download engine (rendered at request time). */
export async function EngineStatusCard() {
  await connection();
  const status = await getEngineStatus();
  return (
    <section aria-labelledby="engine-title" className="mt-12">
      <h2 id="engine-title" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        <Server className="size-5 text-brand" aria-hidden="true" />
        This server
      </h2>
      <dl className="panel mt-4 divide-y">
        <Row label="yt-dlp (metadata and downloads)" ok={status.ready} value={status.ytDlpVersion ?? "Not installed"} />
        <Row label="FFmpeg (merging and MP3 conversion)" ok={status.ffmpeg} value={status.ffmpeg ? "Available" : "Not installed"} />
        <div className="grid gap-1 px-4 py-3 text-sm text-muted-foreground sm:grid-cols-3">
          <p>Max file size: {status.limits.maxFileSizeMb >= 1024 ? `${Math.round(status.limits.maxFileSizeMb / 1024)} GB` : `${status.limits.maxFileSizeMb} MB`}</p>
          <p>Max video length: {status.limits.maxDurationMinutes} min</p>
          <p>Files deleted after: {status.limits.fileTtlMinutes} min</p>
        </div>
      </dl>
      {status.message && <p className="mt-3 text-sm text-warning">{status.message}</p>}
    </section>
  );
}
