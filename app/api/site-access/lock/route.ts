import { NextResponse } from "next/server";
import { SITE_ACCESS_COOKIE_NAME } from "@/lib/site-access/cookie";
import { isSameOriginRequest } from "@/lib/security/same-origin";

export const dynamic = "force-dynamic";

/**
 * Clears only the temporary pre-launch site-access cookie — entirely
 * separate from `app/api/partner-sessions/logout`, which clears the real
 * Partner-session cookie instead. This route only ever runs for a caller
 * the proxy already let through (it lives under /api/, which the
 * pre-launch boundary itself protects), so by the time it executes the
 * caller already possesses a currently-valid access cookie.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ status: "FORBIDDEN" }, { status: 403 });
  }

  const response = NextResponse.json({ status: "LOCKED" }, { status: 200 });
  response.headers.set("Cache-Control", "private, no-store");
  response.cookies.set({
    name: SITE_ACCESS_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
