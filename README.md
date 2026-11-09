# ClipFlow — full-stack video downloader

Paste a video link, see the formats the video **really** has, and download in the quality you choose — on desktop or phone.

Built with **Next.js 16 (App Router)**, React 19, TypeScript, Tailwind CSS 4, shadcn/ui, Zod, and the
**yt-dlp + FFmpeg** media engine.

> Only download videos you own or have permission to use, and follow each platform’s terms of service.

---

## What it does

1. Validates the link (in the browser and again on the server).
2. Asks **yt-dlp** for the real metadata and format list.
3. Builds honest options: separate video/audio streams are paired into MP4 (H.264/AV1/HEVC + AAC) or WebM (VP9/AV1 + Opus);
   audio-only as M4A/Opus (original) or MP3 (converted). Nothing is invented — an option exists only if it can be produced.
4. **Selects the highest available resolution automatically** (calculated from the real formats every time).
5. **MP4 video from a single file streams straight into the browser's download**: the download starts at once and
   nothing is stored on the server. With `STREAM_MERGED_DOWNLOADS=true`, MP4 that needs separate video and audio streams
   too: two yt-dlp processes feed FFmpeg, which merges them into fragmented MP4 on the fly. This is off by default
   because the two processes need more memory than small hosts (e.g. Render's free plan) have.
   (No percentage in the browser: the final size is only known at the end.)
6. **Everything else** (WebM, audio, HLS sources, or as a fallback) is prepared on the server first (download → merge →
   optional MP3 conversion) with real progress, then saved (resumable with HTTP Range). Files are deleted after
   `FILE_TTL_MINUTES`.

## Requirements

| Tool | Why | Install (macOS) | Install (Debian/Ubuntu) |
| --- | --- | --- | --- |
| Node.js ≥ 20.9 | Runs Next.js | `brew install node` | nodejs.org |
| yt-dlp (recent) | Metadata + downloads | `brew install yt-dlp` | `pip install "yt-dlp[default]"` |
| FFmpeg | Merging streams, MP3 | `brew install ffmpeg` | `apt install ffmpeg` |
| Deno | yt-dlp needs it for YouTube | `brew install deno` | deno.com |

Check: `yt-dlp --version`, `ffmpeg -version`, `deno --version`.
Keep yt-dlp up to date (`brew upgrade yt-dlp` / `pip install -U yt-dlp`) — platforms change often.

## Run locally

In the project root:

```bash
npm install          # install dependencies
npm run dev          # http://localhost:3000
```

Optional: copy `.env.example` to `.env.local` to change limits (all values have safe defaults).

**Test on your phone (same Wi-Fi):** run `npm run dev -- --hostname 0.0.0.0`, then open `http://<your-computer-ip>:3000` on the phone.
For a phone on another network you need a real deployment with HTTPS (below).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build (creates `.next/standalone`) |
| `npm start` | Start the production build with `next start` |
| `npm test` | Unit tests (Node’s built-in runner, no extra deps) |
| `npm run test:integration` | Real end-to-end API tests — needs a running server, internet, yt-dlp, FFmpeg. Set `BASE_URL` (default `http://localhost:3000`) |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |

Production without Docker:

```bash
npm run build
cp -r public .next/standalone/ && cp -r .next/static .next/standalone/.next/
PORT=3000 node .next/standalone/server.js
```

## Deployment

ClipFlow needs a **long-running server** with yt-dlp, FFmpeg and Deno installed, writable disk (`DATA_DIR`), and HTTPS.

**Recommended:** the included `Dockerfile` on any container host — Render, Railway, Fly.io, a VPS (with Caddy/Nginx for HTTPS), etc.

```bash
docker build -t clipflow .
docker run -p 3000:3000 -v clipflow-data:/data -e TRUST_PROXY=true clipflow
```

- Mount a persistent volume at `/data` (history + temporary files).
- Set `TRUST_PROXY=true` when behind the host’s proxy so rate limits use the real client IP.
- Run **one instance**: jobs live in the server’s memory. (Scaling out would need a shared queue such as Redis and shared storage.)
- Rebuild the image regularly to get the newest yt-dlp.

### Why not Vercel (or other serverless hosts)?

The site itself would load, but real downloads would not work there:
serverless functions have no yt-dlp/FFmpeg, stop after a time limit, cap response sizes, don’t keep background jobs,
and video platforms (especially YouTube) often block data-center IPs. If deployed there anyway, the app shows a
clear “Downloads are unavailable on this server” notice instead of failing silently.

**YouTube on servers:** if you see “Sign in to confirm you’re not a bot”, YouTube is blocking the server’s IP.
A cookies file (`YTDLP_COOKIES_FILE`) from an account you own can help; use it at your own risk and keep it secret.

## Configuration (`.env.example`)

| Variable | Default | Meaning |
| --- | --- | --- |
| `YTDLP_PATH` / `FFMPEG_PATH` | `yt-dlp` / `ffmpeg` | Tool locations |
| `YTDLP_COOKIES_FILE` | — | Optional cookies file for sign-in-only content |
| `DATA_DIR` | `.data` | History file + per-job folders |
| `FILE_TTL_MINUTES` | 60 | Prepared files are deleted after this |
| `MAX_FILE_SIZE_MB` | 4096 | Larger options are shown as unavailable |
| `MAX_DURATION_MINUTES` | 240 | Longer videos can’t be downloaded |
| `MAX_CONCURRENT_JOBS` | 2 | Jobs processed at once (others wait in a queue) |
| `MAX_ACTIVE_JOBS_PER_SESSION` | 2 | Per browser |
| `MAX_CONCURRENT_ANALYSES` | 4 | yt-dlp analyses at once |
| `JOB_TIMEOUT_MINUTES` / `ANALYSIS_TIMEOUT_SECONDS` | 30 / 60 | Processing timeouts |
| `RATE_LIMIT_ANALYZE_PER_MINUTE` / `RATE_LIMIT_DOWNLOAD_PER_MINUTE` | 20 / 10 | Per client |
| `TRUST_PROXY` | false | Use `X-Forwarded-For` for client IPs |
| `STREAM_MERGED_DOWNLOADS` | false | Stream video+audio MP4 while merging. Needs more memory than small hosts have; leave off on Render's free plan |

## API

All responses are JSON; errors are `{ "error": { "code", "message" } }` with a fitting HTTP status.

| Endpoint | Purpose |
| --- | --- |
| `POST /api/video/info` `{ url }` | Real metadata + options + `defaultOptionId` (highest available) |
| `POST /api/download` `{ analysisId, optionId }` | Create a job (returns the existing job for duplicate submissions) |
| `GET /api/download/:jobId` | Job status, phase, honest progress (`null` when unknown) |
| `GET/HEAD /api/download/:jobId/file` | The file (`Content-Disposition: attachment`, Range support) |
| `GET /api/download/stream?analysisId&optionId` | Streams a `streamable` option while it is made (no file on disk, no Range/resume) |
| `POST /api/download/:jobId/cancel` | Stop processing and delete partial files |
| `GET /api/history`, `DELETE /api/history` | This browser’s history / clear it (deletes files) |
| `DELETE /api/history/:jobId` | Remove one entry and its file |
| `GET /api/health` | Engine status (yt-dlp version, FFmpeg) |

Jobs, files and history are tied to an anonymous, httpOnly session cookie — other browsers get 404.

## Security

- **SSRF protection in two layers:** a DNS check before analysis, and a built-in **egress proxy** that every yt-dlp request
  goes through. It resolves each destination itself, connects only to the checked IP (no DNS rebinding), and blocks
  loopback, private, link-local/cloud-metadata (169.254.169.254), CGNAT, multicast, reserved and IPv4-mapped IPv6 addresses,
  internal hostnames and non-web ports — for redirects and media/CDN requests too.
- Subprocesses use argument arrays (no shell), the user URL comes after `--`, a minimal environment, timeouts, and
  whole-process-group termination on cancel.
- Downloads only use options the server produced (format selectors are never accepted from the browser).
- Safe filenames (no path separators, control characters or header injection) and per-job folders checked against the jobs directory.
- CSRF guard (Sec-Fetch-Site / Origin), Zod request validation, body size limits, rate limiting, concurrency and size/duration limits.
- Security headers (CSP, nosniff, frame-ancestors none, HSTS in production). No stack traces or paths in responses.

## Project structure

```text
src/
├── app/                 Pages (/, /history, /about) and API route handlers (app/api/**)
├── components/          UI: home/, history/, about/, site/ (header, theme), shared/, ui/ (shadcn)
├── hooks/               Browser state: analysis, download job polling, history, engine status
├── lib/
│   ├── shared/          Browser + server: URL validation, platform detection, quality rules, formatting
│   ├── video/           yt-dlp integration, format → option builder, error mapping, analysis cache
│   ├── jobs/            Job queue/manager and progress parsing
│   ├── download/        Filenames, Content-Disposition, MIME types, Range parsing
│   ├── security/        IP rules, DNS check, egress proxy, sessions, rate limit, CSRF guard
│   ├── storage/         History persisted to DATA_DIR/history.json (atomic writes)
│   ├── api/             Route handler wrapper, Zod schemas
│   └── server/          Config, process runner, shared state
├── types/               Shared API types
└── instrumentation.ts   Startup cleanup of interrupted jobs/leftover files
tests/
├── unit/                Pure logic (incl. real yt-dlp format fixtures)
└── integration/         Real end-to-end API + egress-proxy tests
```

## Known limitations

- Platform support depends on yt-dlp and changes over time. Private, age-restricted, members-only and some sign-in-only
  videos can’t be downloaded without a cookies file. DRM-protected streams are never offered.
- Single-instance design (in-memory jobs). Use one server, or add a shared queue to scale out.
- AV1/VP9 files (used for most 1440p/4K) may not play on older iPhones or in QuickTime; the UI says so and offers H.264 where it exists.
- Streamed downloads show no percentage in the browser and can’t be resumed; a failure mid-way shows as a failed download.
  The UI offers “Prepare it on the server instead” as a fallback. Streamed downloads don’t appear in History.
- “File sent to your browser” means the server finished sending the file; whether the device saved it is up to the browser.

## Troubleshooting

- **“The download engine on this server is misconfigured”** — yt-dlp’s Python is missing a module (e.g. `No module named expat`).
  Reinstall: `brew reinstall python@3.14 yt-dlp` (macOS) or rebuild the Docker image.
- **“Downloads are unavailable on this server”** — yt-dlp isn’t installed or not on `PATH` (or set `YTDLP_PATH`).
- **“The platform asked this server to sign in…”** — see the cookies note under Deployment.
