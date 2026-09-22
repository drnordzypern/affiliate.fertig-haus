import { cookies } from "next/headers";
import { logoutPartnerSession } from "@/lib/saleschain/client";
import { clearPartnerSessionCookie, getPartnerSessionToken } from "@/lib/saleschain/session-cookie";

export const dynamic = "force-dynamic";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

export async function POST(): Promise<Response> {
  const cookieStore = await cookies();
  const partnerSessionToken = getPartnerSessionToken(cookieStore);

  if (partnerSessionToken) {
    try {
      await logoutPartnerSession({ partnerSessionToken });
    } catch {
      // The upstream call failing — timeout, SalesChain unavailable, or the
      // session already being invalid on SalesChain's side — must never
      // stop the local cookie from being cleared below.
    }
  }

  // Always clear the local cookie, even if there was nothing to log out,
  // so a repeated logout call is always safe.
  clearPartnerSessionCookie(cookieStore);

  return jsonResponse({ status: "LOGGED_OUT" }, 200);
}
