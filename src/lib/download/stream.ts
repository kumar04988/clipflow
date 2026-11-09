// Streaming downloads: the file is sent to the browser while it is being made, so the browser's own
// download starts at once. Nothing is stored on the server.
// - One source file: yt-dlp writes it to stdout.
// - Separate video + audio: two yt-dlp processes feed FFmpeg through pipes, and FFmpeg merges them.
//   (yt-dlp can merge to stdout by itself, but then FFmpeg downloads the media and YouTube throttles it ~50×.)

import { randomUUID } from "node:crypto";
import type { Readable, Writable } from "node:stream";
import { getConfig, type AppConfig } from "../server/config.ts";
import { getState } from "../server/state.ts";
import { AppError } from "../server/errors.ts";
import { runProcess, terminateProcessTree, type RunningProcess, type RunResult } from "../server/process.ts";
import { activeJobIds } from "../jobs/jobManager.ts";
import { baseYtDlpArgs, runYtDlp } from "../video/engine.ts";
import { getCachedAnalysis } from "../video/analyze.ts";
import { mapEngineError } from "../video/errors.ts";
import { buildDownloadFileName, mimeTypeFor, qualityTag } from "./filename.ts";

// A normal MP4 needs its index written after all the media. Fragmented MP4 can be written front to back
// over a pipe and still plays on phones.
const FRAGMENTED_MP4 = ["-f", "mp4", "-movflags", "frag_keyframe+empty_moov+default_base_moof"];

export interface StreamDownload {
  body: ReadableStream<Uint8Array>;
  fileName: string;
  contentType: string;
}

function failureFor(result: RunResult): AppError {
  if (result.timedOut) return new AppError("timeout", "Processing took too long and was stopped. Try a lower quality.", 504);
  const mapped = mapEngineError(result.stderrTail);
  return new AppError(mapped.code, mapped.message, mapped.status);
}

const failed = (result: RunResult) => result.code !== 0 || result.timedOut;

/** The first chunk of output (the stream is left paused), or null if the process wrote nothing. */
function firstChunk(stdout: Readable): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const settle = (chunk: Buffer | null) => {
      stdout.pause();
      stdout.off("data", onData);
      stdout.off("end", onEnd);
      stdout.off("error", onEnd);
      resolve(chunk);
    };
    const onData = (chunk: Buffer) => settle(chunk);
    const onEnd = () => settle(null);
    stdout.on("data", onData);
    stdout.once("end", onEnd);
    stdout.once("error", onEnd);
  });
}

/** Starts the processes that write the file to the returned `output`. */
function startPipeline(config: AppConfig, baseArgs: string[], url: string, formatIds: string[]): { processes: RunningProcess[]; output: Readable } {
  const ytDlp = (formatId: string) =>
    runYtDlp(
      [...baseArgs, "--format", formatId, "--output", "-", "--max-filesize", `${config.maxFileSizeMb}M`, "--no-progress", "--", url],
      { timeoutMs: config.jobTimeoutMs, rawStdout: true },
    );

  if (formatIds.length === 1) {
    const single = ytDlp(formatIds[0]);
    return { processes: [single], output: single.child.stdout! };
  }

  const [video, audio] = formatIds.map(ytDlp);
  const merger = runProcess(
    config.ffmpegPath,
    ["-hide_banner", "-loglevel", "error", "-i", "pipe:3", "-i", "pipe:4", "-map", "0:v:0", "-map", "1:a:0", "-c", "copy", ...FRAGMENTED_MP4, "pipe:1"],
    { timeoutMs: config.jobTimeoutMs, rawStdout: true, inputPipes: 2 },
  );
  for (const [source, fd] of [[video, 3], [audio, 4]] as const) {
    const input = merger.child.stdio[fd] as Writable;
    // EPIPE etc. when a process stops early; the exit codes report the real failure.
    input.on("error", () => undefined);
    source.child.stdout!.on("error", () => undefined).pipe(input);
  }
  return { processes: [video, audio, merger], output: merger.child.stdout! };
}

/**
 * Starts the download and waits for the first bytes, so errors found before anything is sent
 * (e.g. the video was removed) become a normal error response instead of a broken download.
 */
export async function startStreamDownload(sessionId: string, analysisId: string, optionId: string, signal: AbortSignal): Promise<StreamDownload> {
  const config = getConfig();
  const streams = getState().streams;
  const analysis = getCachedAnalysis(sessionId, analysisId);
  if (!analysis) {
    throw new AppError("analysis_expired", "This analysis has expired. Analyze the link again to see the current formats.", 410);
  }
  const option = analysis.options.find((candidate) => candidate.id === optionId);
  if (!option) throw new AppError("invalid_option", "That quality isn’t available for this video.", 400);
  if (!option.available) throw new AppError("option_unavailable", option.unavailableReason ?? "That quality can’t be downloaded.", 400);
  if (!option.streamable) throw new AppError("not_streamable", "This quality can’t start instantly. Prepare it on the server instead.", 400);

  const sessionStreams = [...streams.values()].filter((owner) => owner === sessionId).length;
  if (sessionStreams + activeJobIds(sessionId).size >= config.maxActiveJobsPerSession) {
    throw new AppError("too_many_jobs", `You can run up to ${config.maxActiveJobsPerSession} downloads at a time. Wait for one to finish.`, 429);
  }
  if (streams.size >= config.maxConcurrentJobs) {
    throw new AppError("busy", "The server is busy with other downloads. Please try again in a moment.", 503, { "Retry-After": "10" });
  }

  // Registered before the first await, so two quick requests can't both pass the limits above.
  const id = randomUUID();
  streams.set(id, sessionId);
  let pipeline: ReturnType<typeof startPipeline>;
  try {
    pipeline = startPipeline(config, await baseYtDlpArgs(), analysis.url, option.parts.map((part) => part.formatId));
  } catch (error) {
    streams.delete(id);
    throw error;
  }

  const { processes, output } = pipeline;
  const stop = () => {
    for (const step of processes) {
      terminateProcessTree(step.child);
      // A process only "closes" once its output is read; nobody reads it after a stop, so drop it.
      step.child.stdout?.destroy();
    }
  };
  // One failed process makes the file useless, so stop the others instead of letting FFmpeg finish a broken file.
  // "exit", not "close": a killed process (e.g. timed out) may have unread output, which delays "close".
  for (const step of processes) step.child.once("exit", (code) => code !== 0 && stop());
  const done = Promise.all(processes.map((step) => step.done)).then(
    // The first failure explains the problem best (a yt-dlp error causes FFmpeg's).
    (results) => results.find(failed) ?? results[results.length - 1],
  );

  if (signal.aborted) stop();
  else signal.addEventListener("abort", stop, { once: true });
  void done.then(() => {
    streams.delete(id);
    signal.removeEventListener("abort", stop);
  });

  const first = await firstChunk(output);
  if (!first) throw failureFor(await done);

  let sentBytes = first.length;
  let settled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(first));
      output.on("data", (chunk: Buffer) => {
        if (settled) return;
        sentBytes += chunk.length;
        if (sentBytes > config.maxFileSizeBytes) {
          settled = true;
          stop();
          controller.error(new AppError("file_too_large", "The file is larger than this server allows.", 413));
          return;
        }
        controller.enqueue(new Uint8Array(chunk));
        if ((controller.desiredSize ?? 1) <= 0) output.pause();
      });
      void done.then((result) => {
        if (settled) return;
        settled = true;
        // A failure after bytes were sent must break the transfer, or the browser would keep a cut-off file.
        if (failed(result)) controller.error(failureFor(result));
        else controller.close();
      });
    },
    pull() {
      output.resume();
    },
    cancel() {
      settled = true;
      stop();
    },
  });

  return {
    body,
    fileName: buildDownloadFileName(analysis.title, qualityTag(option), option.container),
    contentType: mimeTypeFor(option.container),
  };
}
