// Anonymous per-browser session. Jobs, files and history are only visible to the session that created them.

import { randomBytes } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

export const SESSION_COOKIE = "cf_sid";
const SESSION_PATTERN = /^[A-Za-z0-9_-]{32}$/;
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export interface Session {
  id: string;
  isNew: boolean;
}

export function readSession(request: NextRequest): Session {
  const value = request.cookies.get(SESSION_COOKIE)?.value;
  if (value && SESSION_PATTERN.test(value)) return { id: value, isNew: false };
  return { id: randomBytes(24).toString("base64url"), isNew: true };
}

function isHttps(request: NextRequest): boolean {
  return request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
}

export function persistSession(response: NextResponse, session: Session, request: NextRequest): void {
  if (!session.isNew) return;
  response.cookies.set(SESSION_COOKIE, session.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps(request),
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  });
}
