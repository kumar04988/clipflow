# ClipFlow production image: Next.js (standalone) + yt-dlp + FFmpeg + Deno.
# Build:  docker build -t clipflow .
# Run:    docker run -p 3000:3000 -v clipflow-data:/data clipflow

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# public/ may be missing (empty folders are dropped by browser uploads and git).
RUN mkdir -p public && npm run build

FROM node:22-bookworm-slim AS runner
# FFmpeg merges/converts media; Python runs yt-dlp.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg python3 python3-venv ca-certificates \
  && rm -rf /var/lib/apt/lists/*
# yt-dlp[default] includes the components it needs for YouTube; update it often (platforms change).
RUN python3 -m venv /opt/yt-dlp \
  && /opt/yt-dlp/bin/pip install --no-cache-dir --upgrade "yt-dlp[default]" \
  && ln -s /opt/yt-dlp/bin/yt-dlp /usr/local/bin/yt-dlp
# yt-dlp uses Deno to solve YouTube's JavaScript challenges.
COPY --from=denoland/deno:bin-2.9.7 /deno /usr/local/bin/deno

WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/data
# Run as the image's built-in "node" user (UID 1000) — Hugging Face Spaces requires UID 1000.
RUN mkdir -p /data && chown node:node /data

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public

USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
