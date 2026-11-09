import type { ReactNode } from "react";

/** Compact hero: headline + supporting text, with the URL input passed in as children. */
export function Hero({ children }: { children: ReactNode }) {
  return (
    <section aria-labelledby="hero-title" className="relative isolate">
      <div aria-hidden="true" className="bg-grid pointer-events-none absolute inset-x-0 top-0 -z-10 h-[440px]" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-48 left-1/2 -z-10 h-[380px] w-[min(760px,100%)] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl"
      />
      <div className="gutter-x mx-auto max-w-3xl pt-9 pb-7 text-center sm:pt-14">
        <h1
          id="hero-title"
          className="text-[2rem] leading-[1.1] font-semibold tracking-[-0.035em] text-balance sm:text-5xl sm:leading-[1.05]"
        >
          Your videos. Your quality. <br className="hidden sm:block" />
          <span className="text-muted-foreground">Your choice.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-pretty text-muted-foreground sm:text-base">
          Paste a video link, discover its available formats, and download in the quality you choose.
        </p>
        <div className="mt-7 text-left">{children}</div>
      </div>
    </section>
  );
}
