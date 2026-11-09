// Shared wrapper for Route Handlers: session cookie, CSRF guard, consistent JSON errors.

import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { AppError } from "../server/errors.ts";
import { persistSession, readSession, type Session } from "../security/session.ts";
import { assertSameOrigin } from "../security/requestGuard.ts";
import { ensureJobSystemStarted } from "../jobs/jobManager.ts";

const NO_STORE = { "Cache-Control": "no-store" };

export function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}): NextResponse {
  return NextResponse.json(data, { status, headers: { ...NO_STORE, ...headers } });
}

/** Turns any thrown value into `{ error: { code, message } }` without leaking internals. */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof AppError) {
    return jsonResponse({ error: { code: error.code, message: error.message } }, error.status, error.headers);
  }
  if (error instanceof ZodError) {
    return jsonResponse({ error: { code: "invalid_request", message: "The request is missing fields or has invalid values." } }, 400);
  }
  console.error("[clipflow] Unexpected API error:", error instanceof Error ? error.message : error);
  return jsonResponse({ error: { code: "internal_error", message: "Something went wrong on the server. Please try again." } }, 500);
}

interface HandlerContext<Params> {
  request: NextRequest;
  session: Session;
  params: Params;
}

export function apiRoute<Params extends Record<string, string> = Record<string, never>>(
  handler: (context: HandlerContext<Params>) => Promise<Response>,
  options: { mutating?: boolean } = {},
) {
  return async (request: NextRequest, context: { params: Promise<Params> }): Promise<Response> => {
    const session = readSession(request);
    let response: Response;
    try {
      if (options.mutating) assertSameOrigin(request);
      await ensureJobSystemStarted();
      response = await handler({ request, session, params: await context.params });
    } catch (error) {
      response = errorResponse(error);
    }
    if (response instanceof NextResponse) persistSession(response, session, request);
    return response;
  };
}
