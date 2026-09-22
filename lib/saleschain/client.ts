/**
 * Server-only SalesChain upstream client.
 *
 * This is the *only* module in this repository allowed to call SalesChain.
 * It must never be imported from a Client Component (enforced by
 * convention and by `__tests__/source-boundaries.test.ts`, not by a
 * `server-only` package dependency — see AGENTS.md on not adding
 * dependencies without approval).
 *
 * Safety properties, all deliberate:
 * - Every request has an explicit timeout via `AbortController`.
 * - Redirects are never followed (`redirect: "manual"`).
 * - No automatic retry — a failed call fails once, to the caller.
 * - Responses are read with a hard byte bound before JSON-parsing.
 * - Response shapes are validated exactly; anything else is a generic
 *   "contract" error.
 * - Errors never carry the raw upstream body, a token value, or any other
 *   sensitive value — only a coarse `kind` a route handler can map to a
 *   generic HTTP status.
 * - Nothing in this module calls `console.*`.
 */
import { getSalesChainBaseUrl } from "./config";

const REQUEST_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 4_096;

/** Exactly 43 base64url characters — a raw, unpadded 32-byte token. */
export const SALESCHAIN_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type SalesChainErrorKind = "timeout" | "unavailable" | "rejected" | "contract";

export class SalesChainError extends Error {
  readonly kind: SalesChainErrorKind;

  constructor(kind: SalesChainErrorKind, message: string) {
    super(message);
    this.name = "SalesChainError";
    this.kind = kind;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(record: Record<string, unknown>, expected: string[]): boolean {
  const keys = Object.keys(record);
  return keys.length === expected.length && expected.every((key) => keys.includes(key));
}

async function readBounded(response: Response, maxBytes: number): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new SalesChainError("contract", "SalesChain response exceeded the size bound");
  }

  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    if (new TextEncoder().encode(text).length > maxBytes) {
      throw new SalesChainError("contract", "SalesChain response exceeded the size bound");
    }
    return text;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new SalesChainError("contract", "SalesChain response exceeded the size bound");
      }
      chunks.push(value);
    }
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined);
}

async function callSalesChain(
  path: string,
  init: { body?: unknown; authorization?: string }
): Promise<unknown> {
  const baseUrl = getSalesChainBaseUrl();
  const url = `${baseUrl}${path}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const headers: Record<string, string> = {};
  if (init.body !== undefined) {
    headers["content-type"] = "application/json";
  }
  if (init.authorization) {
    headers.authorization = init.authorization;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
      redirect: "manual",
      cache: "no-store",
    });

    if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) {
      throw new SalesChainError("contract", "SalesChain returned an unexpected redirect");
    }

    const text = await readBounded(response, MAX_RESPONSE_BYTES);

    if (response.status >= 500) {
      throw new SalesChainError("unavailable", "SalesChain reported an upstream failure");
    }
    if (!response.ok) {
      throw new SalesChainError("rejected", "SalesChain rejected the request");
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
      throw new SalesChainError("contract", "SalesChain returned a non-JSON response");
    }

    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new SalesChainError("contract", "SalesChain returned a non-JSON response");
    }
  } catch (error) {
    if (error instanceof SalesChainError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new SalesChainError("timeout", "SalesChain request timed out");
    }
    throw new SalesChainError("unavailable", "SalesChain request failed");
  } finally {
    clearTimeout(timeoutId);
  }
}

export type AcceptInvitationResult = {
  status: "ACCEPTED";
  loginBootstrapToken: string;
};

export async function acceptInvitation(input: {
  invitationToken: string;
  turnstileToken: string;
}): Promise<AcceptInvitationResult> {
  const json = await callSalesChain("/v1/public/partner-invitations/accept", {
    body: {
      invitationToken: input.invitationToken,
      turnstileToken: input.turnstileToken,
    },
  });

  if (
    !isRecord(json) ||
    !hasExactKeys(json, ["status", "loginBootstrapToken"]) ||
    json.status !== "ACCEPTED" ||
    typeof json.loginBootstrapToken !== "string" ||
    !SALESCHAIN_TOKEN_PATTERN.test(json.loginBootstrapToken)
  ) {
    throw new SalesChainError("contract", "Unexpected invitation acceptance response");
  }

  return { status: "ACCEPTED", loginBootstrapToken: json.loginBootstrapToken };
}

export async function redeemBootstrapToken(input: {
  loginBootstrapToken: string;
}): Promise<{ partnerSessionToken: string }> {
  const json = await callSalesChain("/v1/public/partner-sessions/bootstrap", {
    body: { loginBootstrapToken: input.loginBootstrapToken },
  });

  if (
    !isRecord(json) ||
    !hasExactKeys(json, ["partnerSessionToken"]) ||
    typeof json.partnerSessionToken !== "string" ||
    !SALESCHAIN_TOKEN_PATTERN.test(json.partnerSessionToken)
  ) {
    throw new SalesChainError("contract", "Unexpected bootstrap redemption response");
  }

  return { partnerSessionToken: json.partnerSessionToken };
}

export async function logoutPartnerSession(input: {
  partnerSessionToken: string;
}): Promise<void> {
  const json = await callSalesChain("/v1/partner-sessions/logout", {
    authorization: `Bearer ${input.partnerSessionToken}`,
  });

  if (!isRecord(json) || !hasExactKeys(json, ["status"]) || json.status !== "LOGGED_OUT") {
    throw new SalesChainError("contract", "Unexpected logout response");
  }
}
