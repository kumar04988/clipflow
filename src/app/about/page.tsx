import type { Metadata } from "next";
import { Suspense } from "react";
import { HardDrive, Scale, ShieldCheck } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PlatformIcon } from "@/components/shared/platform-icon";
import { EngineStatusCard } from "@/components/about/engine-status-card";
import { PLATFORM_NAMES } from "@/lib/shared/platforms";
import type { PlatformId } from "@/types";

export const metadata: Metadata = { title: "About" };

const FACTS = [
  {
    icon: ShieldCheck,
    title: "Private by design",
    text: "Your downloads are tied to this browser only. Every network request the server makes is checked so it can’t reach private or internal addresses.",
  },
  {
    icon: HardDrive,
    title: "Temporary files",
    text: "Files are prepared on the server, sent to your browser, then deleted automatically after a short time.",
  },
  {
    icon: Scale,
    title: "Use it responsibly",
    text: "Only download videos you own or have permission to use, and follow each platform’s terms.",
  },
];

const LINK_FORMATS: Array<[PlatformId, string[]]> = [
  ["youtube", ["youtube.com/watch?v=…", "youtu.be/…", "youtube.com/shorts/…"]],
  ["instagram", ["instagram.com/reel/…", "instagram.com/p/…"]],
  ["facebook", ["facebook.com/…/videos/…", "facebook.com/watch?v=…", "fb.watch/…"]],
  ["x", ["x.com/…/status/…", "twitter.com/…/status/…"]],
  ["tiktok", ["tiktok.com/@…/video/…", "vm.tiktok.com/…"]],
  ["vimeo", ["vimeo.com/…", "player.vimeo.com/video/…"]],
  ["other", ["Many other sites supported by yt-dlp, and direct .mp4 / .webm links"]],
];

export default function AboutPage() {
  return (
    <div className="gutter-x mx-auto max-w-4xl py-10 sm:py-14">
      <h1 className="text-2xl font-semibold tracking-tight">About ClipFlow</h1>
      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
        ClipFlow reads the real formats a video offers using{" "}
        <a href="https://github.com/yt-dlp/yt-dlp" className="font-medium text-brand underline-offset-4 hover:underline" target="_blank" rel="noopener noreferrer">
          yt-dlp
        </a>
        , selects the highest quality it can actually produce, and prepares the file on the server with FFmpeg — merging separate
        video and audio streams when needed — so your browser can save it, on desktop or phone.
      </p>

      <ul className="mt-8 grid gap-3 sm:grid-cols-3">
        {FACTS.map(({ icon: Icon, title, text }) => (
          <li key={title} className="panel p-4">
            <Icon className="size-5 text-brand" aria-hidden="true" />
            <h2 className="mt-3 text-sm font-semibold">{title}</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{text}</p>
          </li>
        ))}
      </ul>

      <section id="supported" aria-labelledby="formats-title" className="mt-12 scroll-mt-20">
        <h2 id="formats-title" className="text-lg font-semibold tracking-tight">
          Supported links
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Some platforms limit what servers can access (private, age-restricted or sign-in-only videos), and support can change when a
          platform updates. When that happens, ClipFlow tells you why instead of guessing.
        </p>
        <ul className="panel mt-4 divide-y">
          {LINK_FORMATS.map(([id, patterns]) => (
            <li key={id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
              <span className="flex w-40 shrink-0 items-center gap-2.5 text-sm font-medium">
                <PlatformIcon platformId={id} size="sm" />
                {id === "other" ? "Other sites" : PLATFORM_NAMES[id]}
              </span>
              <span className="flex flex-wrap gap-1.5">
                {patterns.map((pattern) => (
                  <code key={pattern} className="rounded-md bg-secondary px-1.5 py-0.5 font-mono text-xs break-all text-muted-foreground">
                    {pattern}
                  </code>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <Suspense
        fallback={
          <div className="mt-12">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="mt-4 h-36 rounded-2xl" />
          </div>
        }
      >
        <EngineStatusCard />
      </Suspense>
    </div>
  );
}
