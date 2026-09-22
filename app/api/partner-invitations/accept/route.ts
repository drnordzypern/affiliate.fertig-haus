import { cookies } from "next/headers";
import {
  acceptInvitation,
  logoutPartnerSession,
  redeemBootstrapToken,
  SalesChainError,
  SALESCHAIN_TOKEN_PATTERN,
} from "@/lib/saleschain/client";
import { SalesChainConfigError } from "@/lib/saleschain/config";
import {
  clearPartnerSessionCookie,
  setPartnerSessionCookie,
} from "@/lib/saleschain/session-cookie";
import { isSameOriginRequest } from "@/lib/security/same-origin";

export const dynamic = "force-dynamic";

/** Conservative bound on the local request body — the two fields are short tokens. */
const MAX_REQUEST_BYTES = 4_096;
const MAX_TURNSTILE_TOKEN_LENGTH = 2_048;

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex, nofollow, noarchive, nosnippet, noimageindex",
    },
  });
}

const invalidRequest = () => jsonResponse({ status: "INVALID_REQUEST" }, 400);
const forbiddenOrigin = () => jsonResponse({ status: "FORBIDDEN" }, 403);
const unavailableInvitation = () => jsonResponse({ status: "UNAVAILABLE" }, 404);
const upstreamUnavailable = () => jsonResponse({ status: "UNAVAILABLE" }, 503);
const upstreamContractError = () => jsonResponse({ status: "UNAVAILABLE" }, 502);

type AcceptRequestBody = { invitationToken: string; turnstileToken: string };

/**
 * Strictly validates the request body: exactly these two string fields,
 * nothing else. Extra fields are rejected rather than ignored.
 */
function parseAcceptRequestBody(body: unknown): AcceptRequestBody | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }

  const record = body as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 2 || !keys.includes("invitationToken") || !keys.includes("turnstileToken")) {
    return null;
  }

  const { invitationToken, turnstileToken } = record;

  if (typeof invitationToken !== "string" || !SALESCHAIN_TOKEN_PATTERN.test(invitationToken)) {
    return null;
  }

  if (
    typeof turnstileToken !== "string" ||
    turnstileToken.length === 0 ||
    turnstileToken.length > MAX_TURNSTILE_TOKEN_LENGTH
  ) {
    return null;
  }

  return { invitationToken, turnstileToken };
}

async function readBoundedRequestBody(request: Request): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return "";

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    total += value.byteLength;
    if (total > MAX_REQUEST_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined);
}

async function compensatePartnerSession(partnerSessionToken: string): Promise<void> {
  try {
    await logoutPartnerSession({ partnerSessionToken });
  } catch {
    // Best effort only. Compensation must never replace or expose the
    // original generic failure, and the logout operation is never retried.
  }
}

function mapErrorToResponse(error: unknown): Response {
  if (error instanceof SalesChainConfigError) {
    return upstreamUnavailable();
  }
  if (error instanceof SalesChainError) {
    switch (error.kind) {
      case "timeout":
      case "unavailable":
        return upstreamUnavailable();
      case "rejected":
        return unavailableInvitation();
      case "contract":
      default:
        return upstreamContractError();
    }
  }
  return upstreamContractError();
}

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) {
    return forbiddenOrigin();
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return invalidRequest();
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const normalized = contentLength.trim();
    if (!/^\d+$/.test(normalized) || Number(normalized) > MAX_REQUEST_BYTES) {
      return invalidRequest();
    }
  }

  let rawBody: string | null;
  try {
    rawBody = await readBoundedRequestBody(request);
  } catch {
    return invalidRequest();
  }

  if (rawBody === null) {
    return invalidRequest();
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return invalidRequest();
  }

  const validated = parseAcceptRequestBody(parsedBody);
  if (!validated) {
    return invalidRequest();
  }

  let issuedSessionToken: string | null = null;
  let cookieStore: Awaited<ReturnType<typeof cookies>> | null = null;

  try {
    const acceptance = await acceptInvitation(validated);

    const bootstrap = await redeemBootstrapToken({
      loginBootstrapToken: acceptance.loginBootstrapToken,
    });
    issuedSessionToken = bootstrap.partnerSessionToken;

    if (request.signal.aborted) {
      throw new SalesChainError("unavailable", "Affiliate request was aborted");
    }

    cookieStore = await cookies();
    setPartnerSessionCookie(cookieStore, bootstrap.partnerSessionToken);

    return jsonResponse({ status: "AUTHENTICATED" }, 200);
  } catch (error) {
    if (issuedSessionToken) {
      if (cookieStore) {
        try {
          clearPartnerSessionCookie(cookieStore);
        } catch {
          // The original failure remains authoritative.
        }
      }
      await compensatePartnerSession(issuedSessionToken);
    }
    return mapErrorToResponse(error);
  }
}
