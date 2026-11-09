import { Download, Layers, Link2 } from "lucide-react";

const STEPS = [
  { icon: Link2, title: "Paste a link", text: "From YouTube, Instagram, Facebook, X, TikTok, Vimeo and many other sites." },
  { icon: Layers, title: "Pick a quality", text: "We read the formats the video really has and pre-select the highest one." },
  { icon: Download, title: "Download", text: "The file is prepared on the server and saved by your browser — on phone or desktop." },
];

export function IdleState() {
  return (
    <section aria-label="How it works" className="rounded-2xl border border-dashed p-5 sm:p-6">
      <ol className="grid gap-5 sm:grid-cols-3 sm:gap-6">
        {STEPS.map(({ icon: Icon, title, text }, index) => (
          <li key={title} className="flex gap-3.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl border bg-card text-muted-foreground">
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-medium">
                <span className="mr-1.5 font-mono text-xs text-subtle">0{index + 1}</span>
                {title}
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{text}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
