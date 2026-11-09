import type { NextRequest } from "next/server";
import { jsonResponse } from "../api/handler.ts";

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

/** Browsers open download links directly, so errors are shown as a small page instead of raw JSON. */
export function fileErrorResponse(request: NextRequest, status: number, code: string, message: string): Response {
  if (!(request.headers.get("accept") ?? "").includes("text/html")) {
    return jsonResponse({ error: { code, message } }, status);
  }
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>File unavailable · ClipFlow</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#08080a;color:#ededf0;padding:24px}main{max-width:420px;text-align:center}p{color:#a1a1aa;line-height:1.5}a{display:inline-block;margin-top:12px;background:#5f5fe0;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:600}</style></head>
<body><main><h1 style="font-size:20px">File unavailable</h1><p>${escapeHtml(message)}</p><a href="/">Back to ClipFlow</a></main></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
