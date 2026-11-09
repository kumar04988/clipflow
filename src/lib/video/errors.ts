// Maps the engine's error output to a short, honest message for the user.
// The raw output is never sent to the browser (it can contain paths and URLs).

export interface EngineErrorInfo {
  code: string;
  message: string;
  status: number;
}

const RULES: Array<{ pattern: RegExp; code: string; status: number; message: string }> = [
  {
    // e.g. "No module named expat" — the server's Python/yt-dlp installation is broken.
    pattern: /No module named|ModuleNotFoundError|ImportError|Library not loaded|Symbol not found/i,
    code: "engine_misconfigured",
    status: 500,
    message: "The download engine on this server is misconfigured (a required module is missing). Reinstalling yt-dlp/Python on the server fixes this.",
  },
  {
    pattern: /ClipFlow network policy|Tunnel connection failed: 403/i,
    code: "blocked_destination",
    status: 400,
    message: "This link leads to a private or internal network address, which isn’t allowed.",
  },
  {
    pattern: /confirm you.?re not a bot|Sign in to confirm/i,
    code: "platform_blocked",
    status: 502,
    message: "The platform asked this server to sign in or prove it isn’t a bot. Try again later, or see the README for using a cookies file.",
  },
  { pattern: /Unsupported URL/i, code: "unsupported_url", status: 422, message: "This link isn’t supported, or there’s no video on that page." },
  { pattern: /Private video|This video is private|is private/i, code: "private_video", status: 403, message: "This video is private." },
  {
    pattern: /age.?restrict|confirm your age|inappropriate for some users/i,
    code: "age_restricted",
    status: 403,
    message: "This video is age-restricted and needs a signed-in account.",
  },
  {
    pattern: /members.only|join this channel|Premium/i,
    code: "members_only",
    status: 403,
    message: "This video is only available to members or subscribers.",
  },
  {
    pattern: /not available in your country|geo.?restrict|blocked it in your country/i,
    code: "geo_restricted",
    status: 403,
    message: "This video isn’t available in the server’s region.",
  },
  {
    pattern: /Video unavailable|is unavailable|has been removed|no longer available|does not exist|HTTP Error 404|404: Not Found|\bNot found\b/i,
    code: "not_found",
    status: 404,
    message: "This video is unavailable, deleted, or the link is wrong.",
  },
  {
    pattern: /login required|requires login|log in|logged-in|cookies/i,
    code: "login_required",
    status: 403,
    message: "This platform requires a signed-in account to access this video.",
  },
  {
    pattern: /live event will begin|Premieres in|is_live|live stream|currently live/i,
    code: "live_stream",
    status: 422,
    message: "Live streams and upcoming premieres can’t be downloaded.",
  },
  {
    pattern: /Requested format is not available|requested formats? (are|is) not available/i,
    code: "format_unavailable",
    status: 409,
    message: "That quality is no longer offered by the platform. Analyze the link again.",
  },
  {
    pattern: /larger than max-filesize|File is larger than/i,
    code: "too_large",
    status: 413,
    message: "The file is larger than this server allows.",
  },
  {
    pattern: /HTTP Error 403|403: Forbidden/i,
    code: "access_denied",
    status: 502,
    message: "The platform refused access to this video. Try again, or try another quality.",
  },
  {
    pattern: /HTTP Error 429|Too Many Requests/i,
    code: "rate_limited_upstream",
    status: 503,
    message: "The platform is limiting requests from this server. Please try again in a few minutes.",
  },
  {
    pattern: /timed out|timeout|Connection reset|Unable to download webpage|Failed to resolve|Name or service not known|nodename nor servname/i,
    code: "network_error",
    status: 504,
    message: "The server couldn’t reach the platform. Check the link and try again.",
  },
  {
    pattern: /ffmpeg|ffprobe|Postprocessing|Conversion failed/i,
    code: "processing_failed",
    status: 500,
    message: "The media was downloaded but couldn’t be processed. Try another quality or format.",
  },
];

export function mapEngineError(output: string): EngineErrorInfo {
  for (const rule of RULES) {
    if (rule.pattern.test(output)) return { code: rule.code, status: rule.status, message: rule.message };
  }
  return { code: "engine_error", status: 502, message: "The video couldn’t be processed. Try again or try a different link." };
}
