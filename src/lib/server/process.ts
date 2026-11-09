// Runs command-line tools safely: arguments are passed as an array (no shell),
// with a timeout, a minimal environment and whole-process-group termination.

import { spawn, type ChildProcess } from "node:child_process";

export interface RunOptions {
  timeoutMs: number;
  /** Keep stdout in memory (for JSON output). Lines are always passed to onLine. */
  collectStdout?: boolean;
  maxStdoutBytes?: number;
  /** Leave stdout untouched so the caller can read binary output (e.g. a media file) from `child.stdout`. */
  rawStdout?: boolean;
  /** Extra writable pipes after stderr (fd 3, 4, …), e.g. FFmpeg's `-i pipe:3`. Reach them via `child.stdio[n]`. */
  inputPipes?: number;
  onLine?: (line: string, stream: "stdout" | "stderr") => void;
}

export interface RunResult {
  code: number | null;
  stdout: string;
  /** Last lines of stderr, used to explain failures. Never shown to users as-is. */
  stderrTail: string;
  timedOut: boolean;
  outputTooLarge: boolean;
}

export interface RunningProcess {
  child: ChildProcess;
  done: Promise<RunResult>;
}

const STDERR_TAIL_LINES = 40;
const isWindows = process.platform === "win32";

/** Only what the tools need. Proxy variables are dropped so they can't bypass our egress proxy. */
export function childEnvironment(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: process.env.NODE_ENV,
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    TMPDIR: process.env.TMPDIR,
    LANG: "en_US.UTF-8",
    PYTHONIOENCODING: "utf-8",
    PYTHONUTF8: "1",
    ...extra,
  };
  if (isWindows) {
    env.SYSTEMROOT = process.env.SYSTEMROOT;
    env.USERPROFILE = process.env.USERPROFILE;
  }
  return env;
}

/** Stops a process and everything it started (e.g. yt-dlp → ffmpeg). */
export function terminateProcessTree(child: ChildProcess): void {
  if (!child.pid || child.exitCode !== null) return;
  const pid = child.pid;
  const send = (signal: NodeJS.Signals) => {
    try {
      if (isWindows) child.kill(signal);
      else process.kill(-pid, signal);
    } catch {
      // Already exited.
    }
  };
  send("SIGTERM");
  setTimeout(() => {
    if (child.exitCode === null) send("SIGKILL");
  }, 4000).unref();
}

export function runProcess(command: string, args: string[], options: RunOptions): RunningProcess {
  const child = spawn(command, args, {
    shell: false,
    windowsHide: true,
    // Own process group, so a cancel also stops ffmpeg started by yt-dlp.
    detached: !isWindows,
    stdio: ["ignore", "pipe", "pipe", ...Array.from({ length: options.inputPipes ?? 0 }, () => "pipe" as const)],
    env: childEnvironment(),
  });

  const done = new Promise<RunResult>((resolve) => {
    let stdout = "";
    let stdoutBytes = 0;
    let outputTooLarge = false;
    let timedOut = false;
    const stderrLines: string[] = [];
    const partial = { stdout: "", stderr: "" };

    const timer = setTimeout(() => {
      timedOut = true;
      terminateProcessTree(child);
    }, options.timeoutMs);

    const handleChunk = (stream: "stdout" | "stderr", chunk: Buffer) => {
      const text = chunk.toString("utf8");
      if (stream === "stdout" && options.collectStdout) {
        stdoutBytes += chunk.length;
        if (stdoutBytes > (options.maxStdoutBytes ?? 64 * 1024 * 1024)) {
          outputTooLarge = true;
          terminateProcessTree(child);
        } else {
          stdout += text;
        }
      }
      const lines = (partial[stream] + text).split(/\r?\n|\r/);
      partial[stream] = lines.pop() ?? "";
      for (const line of lines) {
        if (!line) continue;
        if (stream === "stderr") {
          stderrLines.push(line);
          if (stderrLines.length > STDERR_TAIL_LINES) stderrLines.shift();
        }
        // JSON output is one huge line; don't hand it to line handlers.
        if (!(stream === "stdout" && options.collectStdout)) options.onLine?.(line, stream);
      }
    };

    if (!options.rawStdout) child.stdout?.on("data", (chunk: Buffer) => handleChunk("stdout", chunk));
    child.stderr?.on("data", (chunk: Buffer) => handleChunk("stderr", chunk));

    let finished = false;
    const finish = (code: number | null) => {
      // "error" and "close" can both fire; settle only once.
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      for (const stream of ["stdout", "stderr"] as const) {
        if (partial[stream] && !(stream === "stdout" && options.collectStdout)) options.onLine?.(partial[stream], stream);
        if (stream === "stderr" && partial.stderr) stderrLines.push(partial.stderr);
      }
      resolve({ code, stdout, stderrTail: stderrLines.join("\n"), timedOut, outputTooLarge });
    };

    child.once("error", (error) => {
      stderrLines.push(`spawn error: ${error.message}`);
      finish(null);
    });
    child.once("close", (code) => finish(code));
  });

  return { child, done };
}
