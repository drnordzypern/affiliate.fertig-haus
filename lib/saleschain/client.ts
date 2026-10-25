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
  /** Upstream HTTP status, set only for a "rejected" (4xx) answer; never the body. */
  readonly httpStatus: number | undefined;

  constructor(kind: SalesChainErrorKind, message: string, httpStatus?: number) {
    super(message);
    this.name = "SalesChainError";
    this.kind = kind;
    this.httpStatus = httpStatus;
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

/**
 * The single upstream call. `maxBytes` bounds the response read (default 4 KiB,
 * the size of every pre-existing contract); a list-bearing response may ask for
 * more, never unbounded.
 */
export async function callSalesChain(
  path: string,
  init: { method?: "GET" | "POST"; body?: unknown; authorization?: string; maxBytes?: number }
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
  // Optional, server-side only: a protected review deployment of the SalesChain API (Vercel Deployment Protection) answers this
  // site's server-to-server calls only when they carry the project's protection-bypass secret. Unset in Production.
  const protectionBypass = process.env.SALESCHAIN_API_PROTECTION_BYPASS;
  if (protectionBypass) {
    headers["x-vercel-protection-bypass"] = protectionBypass;
  }

  try {
    const response = await fetch(url, {
      method: init.method ?? "POST",
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
      redirect: "manual",
      cache: "no-store",
    });

    if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) {
      throw new SalesChainError("contract", "SalesChain returned an unexpected redirect");
    }

    const text = await readBounded(response, init.maxBytes ?? MAX_RESPONSE_BYTES);

    if (response.status >= 500) {
      throw new SalesChainError("unavailable", "SalesChain reported an upstream failure");
    }
    if (!response.ok) {
      throw new SalesChainError("rejected", "SalesChain rejected the request", response.status);
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

/**
 * DNL1-63: the Affiliate BFF's server-side bearer-session validation check
 * (`GET /v1/partner-sessions/me`) — the non-destructive counterpart to
 * `logoutPartnerSession` above. Every failure mode collapses to `false`:
 * a non-2xx status, a malformed/extra-field response, a timeout, or a
 * network error are all treated identically as "not authenticated". This
 * function never throws and never returns anything but a boolean — there
 * is no partial-trust result, and callers must not attempt to distinguish
 * *why* a session was rejected from this return value alone.
 */
export async function checkPartnerSession(input: {
  partnerSessionToken: string;
}): Promise<boolean> {
  try {
    const json = await callSalesChain("/v1/partner-sessions/me", {
      method: "GET",
      authorization: `Bearer ${input.partnerSessionToken}`,
    });

    return isRecord(json) && hasExactKeys(json, ["status"]) && json.status === "AUTHENTICATED";
  } catch {
    return false;
  }
}

export type PartnerReferralLink = {
  purpose: "CUSTOMER_REFERRAL" | "PARTNER_RECRUITMENT";
  /** The public link, always on https://affiliate.fertig-haus.net. */
  url: string;
  /** What the QR code encodes: the link plus `qr` and `v`, or null without an active QR asset. */
  qrUrl: string | null;
};

const LINK_PATH = { CUSTOMER_REFERRAL: /^\/r\/[A-Z0-9-]{8,80}$/, PARTNER_RECRUITMENT: /^\/apply\/[A-Z0-9-]{8,80}$/ } as const;

function parseReferralLink(value: unknown): PartnerReferralLink | null {
  if (!isRecord(value) || !hasExactKeys(value, ["purpose", "url", "qrUrl"])) return null;
  const { purpose, url, qrUrl } = value;
  if (purpose !== "CUSTOMER_REFERRAL" && purpose !== "PARTNER_RECRUITMENT") return null;
  if (typeof url !== "string") return null;
  let link: URL;
  try {
    link = new URL(url);
  } catch {
    return null;
  }
  if (link.protocol !== "https:" || link.host !== "affiliate.fertig-haus.net" || link.search || link.hash) return null;
  if (!LINK_PATH[purpose].test(link.pathname)) return null;
  if (qrUrl === null) return { purpose, url: link.toString(), qrUrl: null };
  if (typeof qrUrl !== "string") return null;
  let target: URL;
  try {
    target = new URL(qrUrl);
  } catch {
    return null;
  }
  const params = [...target.searchParams.keys()];
  if (
    target.origin !== link.origin ||
    target.pathname !== link.pathname ||
    target.hash ||
    params.length !== 2 ||
    !/^[A-Za-z0-9_-]{8,100}$/.test(target.searchParams.get("qr") ?? "") ||
    !/^[1-9]\d{0,5}$/.test(target.searchParams.get("v") ?? "")
  )
    return null;
  return { purpose, url: link.toString(), qrUrl: target.toString() };
}

/**
 * The signed-in Partner's own referral links (`GET /v1/partner-sessions/me/referral-links`).
 * SalesChain derives the Partner from the session itself. Returns null on ANY failure (rejected
 * session, timeout, malformed or extra-field response, a link off the affiliate host): the portal
 * then shows that the links are currently unavailable - it never shows a partial or derived link.
 */
export async function getOwnReferralLinks(input: {
  partnerSessionToken: string;
}): Promise<PartnerReferralLink[] | null> {
  try {
    const json = await callSalesChain("/v1/partner-sessions/me/referral-links", {
      method: "GET",
      authorization: `Bearer ${input.partnerSessionToken}`,
    });
    if (!isRecord(json) || !hasExactKeys(json, ["links"]) || !Array.isArray(json.links) || json.links.length > 10)
      return null;
    const links = json.links.map(parseReferralLink);
    return links.every((link): link is PartnerReferralLink => link !== null) ? links : null;
  } catch {
    return null;
  }
}


// ---------------------------------------------------------------------------
// Public journeys (partner application, customer referral). Every call is made
// by this app's BFF, server-to-server, to the SalesChain public routes; the
// browser never sees the upstream URL, and the upstream never sees the browser.
// Response shapes are validated exactly; anything else is a "contract" error.
// ---------------------------------------------------------------------------

/** The only programme these journeys serve (the same literal the SalesChain contract pins). */
const PROGRAMME_SLUG = "fertig-haus-affiliate-system";
/** A customer-referral context lists the programme's products, so it may exceed 4 KiB. */
const MAX_CONTEXT_RESPONSE_BYTES = 32_768;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PublicTracking = {
  qr?: string;
  v?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
};

export type PublicContext = {
  programmeName: string;
  brandName: string;
  consentPolicyVersion: string;
  /** Present for referred applications and customer referrals; absent for a direct application. */
  attributionCorrelationId?: string;
  /** Present for customer referrals only. */
  products?: { code: string; name: string; description: string | null }[];
};

function isNamed(value: unknown): value is { slug: string; name: string } {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["slug", "name"]) &&
    typeof value.slug === "string" &&
    typeof value.name === "string" &&
    value.name.length > 0 &&
    value.name.length <= 200
  );
}

function parseContext(
  json: unknown,
  keys: string[],
  options: { correlation: boolean; products: boolean }
): PublicContext {
  if (
    !isRecord(json) ||
    !hasExactKeys(json, keys) ||
    !isNamed(json.programme) ||
    !isNamed(json.brand) ||
    typeof json.consentPolicyVersion !== "string" ||
    json.consentPolicyVersion.length === 0 ||
    json.consentPolicyVersion.length > 80 ||
    typeof json.notice !== "string"
  ) {
    throw new SalesChainError("contract", "Unexpected public context response");
  }

  const context: PublicContext = {
    programmeName: json.programme.name,
    brandName: json.brand.name,
    consentPolicyVersion: json.consentPolicyVersion,
  };

  if (options.correlation) {
    if (typeof json.attributionCorrelationId !== "string" || !UUID_PATTERN.test(json.attributionCorrelationId)) {
      throw new SalesChainError("contract", "Unexpected public context response");
    }
    context.attributionCorrelationId = json.attributionCorrelationId;
  }

  if (options.products) {
    const raw = json.products;
    if (!Array.isArray(raw) || raw.length > 100) {
      throw new SalesChainError("contract", "Unexpected public context response");
    }
    context.products = raw.map((item) => {
      if (
        !isRecord(item) ||
        typeof item.code !== "string" ||
        !/^[A-Z0-9-]{2,40}$/.test(item.code) ||
        typeof item.name !== "string" ||
        (item.description !== null && item.description !== undefined && typeof item.description !== "string")
      ) {
        throw new SalesChainError("contract", "Unexpected public context response");
      }
      return { code: item.code, name: item.name, description: typeof item.description === "string" ? item.description : null };
    });
  }

  return context;
}

function parseSubmission(json: unknown, keys: string[], pattern: RegExp): { publicReference: string } {
  if (
    !isRecord(json) ||
    !hasExactKeys(json, keys) ||
    typeof json.publicReference !== "string" ||
    !pattern.test(json.publicReference)
  ) {
    throw new SalesChainError("contract", "Unexpected public submission response");
  }
  return { publicReference: json.publicReference };
}

const APPLICATION_REFERENCE = /^PA-\d{4}-[A-Z0-9]{10}$/;
const LEAD_REFERENCE = /^LEAD-[A-Z0-9]{8}$/;

function trackingQuery(tracking: PublicTracking): string {
  const query = new URLSearchParams();
  if (tracking.qr) query.set("qr", tracking.qr);
  if (tracking.v) query.set("v", tracking.v);
  if (tracking.utmSource) query.set("utm_source", tracking.utmSource);
  if (tracking.utmMedium) query.set("utm_medium", tracking.utmMedium);
  if (tracking.utmCampaign) query.set("utm_campaign", tracking.utmCampaign);
  if (tracking.utmTerm) query.set("utm_term", tracking.utmTerm);
  if (tracking.utmContent) query.set("utm_content", tracking.utmContent);
  const text = query.toString();
  return text ? `?${text}` : "";
}

/** Direct (sponsor-free) application: GET /v1/public/partner-applications/direct. */
export async function resolveDirectApplication(): Promise<PublicContext> {
  const json = await callSalesChain("/v1/public/partner-applications/direct", { method: "GET" });
  return parseContext(json, ["programme", "brand", "consentPolicyVersion", "notice"], {
    correlation: false,
    products: false,
  });
}

export async function submitDirectApplication(body: Record<string, unknown>): Promise<{ publicReference: string }> {
  const json = await callSalesChain("/v1/public/partner-applications/direct", { method: "POST", body });
  return parseSubmission(json, ["publicReference", "status"], APPLICATION_REFERENCE);
}

/** Referred application (a partner's recruitment link or QR): purpose PARTNER_RECRUITMENT. */
export async function resolveReferredApplication(code: string, tracking: PublicTracking): Promise<PublicContext> {
  const path = `/v1/public/programmes/${PROGRAMME_SLUG}/partner-applications/${encodeURIComponent(code)}`;
  const json = await callSalesChain(`${path}${trackingQuery({ qr: tracking.qr, v: tracking.v })}`, { method: "GET" });
  return parseContext(json, ["programme", "brand", "attributionCorrelationId", "consentPolicyVersion", "notice"], {
    correlation: true,
    products: false,
  });
}

export async function submitReferredApplication(
  code: string,
  body: Record<string, unknown>
): Promise<{ publicReference: string }> {
  const path = `/v1/public/programmes/${PROGRAMME_SLUG}/partner-applications/${encodeURIComponent(code)}`;
  const json = await callSalesChain(path, { method: "POST", body });
  return parseSubmission(json, ["publicReference", "status"], APPLICATION_REFERENCE);
}

/** Customer referral (a partner's personal link or QR): purpose CUSTOMER_REFERRAL. Creates attribution, never a recruitment. */
export async function resolveCustomerReferral(code: string, tracking: PublicTracking): Promise<PublicContext> {
  const path = `/v1/public/programmes/${PROGRAMME_SLUG}/referrals/${encodeURIComponent(code)}`;
  const json = await callSalesChain(`${path}${trackingQuery(tracking)}`, {
    method: "GET",
    maxBytes: MAX_CONTEXT_RESPONSE_BYTES,
  });
  return parseContext(
    json,
    ["programme", "brand", "products", "attributionCorrelationId", "consentPolicyVersion", "notice"],
    { correlation: true, products: true }
  );
}

export async function submitCustomerReferral(
  code: string,
  body: Record<string, unknown>
): Promise<{ publicReference: string }> {
  const path = `/v1/public/programmes/${PROGRAMME_SLUG}/referrals/${encodeURIComponent(code)}/leads`;
  const json = await callSalesChain(path, { method: "POST", body });
  return parseSubmission(json, ["publicReference", "status"], LEAD_REFERENCE);
}
