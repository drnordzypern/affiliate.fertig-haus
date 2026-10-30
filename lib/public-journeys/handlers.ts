import {
  resolveCustomerReferral,
  resolveDirectApplication,
  resolveReferredApplication,
  SalesChainError,
  submitCustomerReferral,
  submitDirectApplication,
  submitReferredApplication,
  type PublicContext,
} from "@/lib/saleschain/client";
import { SalesChainConfigError } from "@/lib/saleschain/config";
import { isSameOriginRequest } from "@/lib/security/same-origin";
import { customerReferralsEnabled, partnerApplicationsEnabled } from "./config";
import { customerSiteDestination, handoffUrl, type HandoffTracking } from "./handoff";
import { anyApprovedConsent, approvedConsentText, type ConsentKind } from "./consent";
import {
  parseApplicationBody,
  parseContextRequest,
  parseReferralCode,
  parseReferralLeadBody,
} from "./validation";

/**
 * Request handling for the public-journey BFF routes, kept free of Next.js so
 * it can be tested directly. The route files are one-line adapters.
 *
 * Every handler, in this order: feature gate (404, nothing else happens),
 * same-origin check, JSON body bounds and shape, strict validation, consent
 * wording check, then the single server-to-server SalesChain call. Upstream
 * failures collapse to a small fixed vocabulary; no upstream body, token or
 * internal id is ever echoed, and no response is cacheable.
 */

const MAX_REQUEST_BYTES = 12_288;

type Status = "OK" | "INVALID_REQUEST" | "FORBIDDEN" | "UNAVAILABLE" | "RATE_LIMITED" | "CONFLICT";

function respond(body: { status: Status } & Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex, nofollow, noarchive, nosnippet, noimageindex",
    },
  });
}

const unavailable = () => respond({ status: "UNAVAILABLE" }, 404);
const invalid = () => respond({ status: "INVALID_REQUEST" }, 400);

async function readBoundedBody(request: Request): Promise<string | null> {
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

type Prepared = { ok: true; body: unknown } | { ok: false; response: Response };

/** Same-origin, bounded, JSON. An empty body is allowed when `allowEmpty` (context requests with no tracking). */
async function prepare(request: Request, allowEmpty: boolean): Promise<Prepared> {
  if (!isSameOriginRequest(request)) return { ok: false, response: respond({ status: "FORBIDDEN" }, 403) };

  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const normalized = contentLength.trim();
    if (!/^\d+$/.test(normalized) || Number(normalized) > MAX_REQUEST_BYTES) return { ok: false, response: invalid() };
  }

  let raw: string | null;
  try {
    raw = await readBoundedBody(request);
  } catch {
    return { ok: false, response: invalid() };
  }
  if (raw === null) return { ok: false, response: invalid() };
  if (raw.trim().length === 0) return allowEmpty ? { ok: true, body: undefined } : { ok: false, response: invalid() };

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.split(";", 1)[0].trim().toLowerCase() !== "application/json") return { ok: false, response: invalid() };
  try {
    return { ok: true, body: JSON.parse(raw) as unknown };
  } catch {
    return { ok: false, response: invalid() };
  }
}

/** Upstream failures, collapsed. A 404 stays indistinguishable (unknown code, feature off, bot check refused, expired session). */
function mapError(error: unknown): Response {
  if (error instanceof SalesChainConfigError) return respond({ status: "UNAVAILABLE" }, 503);
  if (error instanceof SalesChainError) {
    switch (error.kind) {
      case "timeout":
      case "unavailable":
        return respond({ status: "UNAVAILABLE" }, 503);
      case "rejected":
        if (error.httpStatus === 400 || error.httpStatus === 413) return invalid();
        if (error.httpStatus === 409) return respond({ status: "CONFLICT" }, 409);
        if (error.httpStatus === 429) return respond({ status: "RATE_LIMITED" }, 429);
        return unavailable();
      case "contract":
      default:
        return respond({ status: "UNAVAILABLE" }, 502);
    }
  }
  return respond({ status: "UNAVAILABLE" }, 502);
}

/**
 * While NO consent wording is approved for a journey, its form cannot exist, so
 * the context is not even requested: SalesChain would otherwise record an
 * attribution session for a page nobody can use. The visitor sees the same
 * "not yet released" state either way.
 */
function consentPendingResponse(): Response {
  return respond({ status: "OK", consent: { version: null, text: null } }, 200);
}

function contextResponse(context: PublicContext, kind: ConsentKind): Response {
  return respond(
    {
      status: "OK",
      programmeName: context.programmeName,
      brandName: context.brandName,
      ...(context.attributionCorrelationId ? { attributionCorrelationId: context.attributionCorrelationId } : {}),
      ...(context.products ? { products: context.products } : {}),
      consent: {
        version: context.consentPolicyVersion,
        // null until the owner has approved wording for exactly this version.
        text: approvedConsentText(kind, context.consentPolicyVersion),
      },
    },
    200
  );
}

// --- partner application: direct ---------------------------------------------

export async function directApplicationContext(request: Request): Promise<Response> {
  if (!partnerApplicationsEnabled()) return unavailable();
  const prepared = await prepare(request, true);
  if (!prepared.ok) return prepared.response;
  if (parseContextRequest(prepared.body, false) === null) return invalid();
  if (!anyApprovedConsent("partnerApplication")) return consentPendingResponse();
  try {
    return contextResponse(await resolveDirectApplication(), "partnerApplication");
  } catch (error) {
    return mapError(error);
  }
}

export async function directApplicationSubmit(request: Request): Promise<Response> {
  if (!partnerApplicationsEnabled()) return unavailable();
  const prepared = await prepare(request, false);
  if (!prepared.ok) return prepared.response;
  const parsed = parseApplicationBody(prepared.body, false);
  if (!parsed) return invalid();
  if (!approvedConsentText("partnerApplication", parsed.consentPolicyVersion)) return unavailable();
  try {
    const result = await submitDirectApplication(parsed.upstream);
    return respond({ status: "OK", publicReference: result.publicReference }, 200);
  } catch (error) {
    return mapError(error);
  }
}

// --- partner application: referred (a partner's recruitment link or QR) ------

export async function referredApplicationContext(request: Request, code: string): Promise<Response> {
  if (!partnerApplicationsEnabled()) return unavailable();
  const referralCode = parseReferralCode(code);
  if (!referralCode) return unavailable();
  const prepared = await prepare(request, true);
  if (!prepared.ok) return prepared.response;
  const tracking = parseContextRequest(prepared.body, false);
  if (tracking === null) return invalid();
  if (!anyApprovedConsent("partnerApplication")) return consentPendingResponse();
  try {
    return contextResponse(await resolveReferredApplication(referralCode, tracking), "partnerApplication");
  } catch (error) {
    return mapError(error);
  }
}

export async function referredApplicationSubmit(request: Request, code: string): Promise<Response> {
  if (!partnerApplicationsEnabled()) return unavailable();
  const referralCode = parseReferralCode(code);
  if (!referralCode) return unavailable();
  const prepared = await prepare(request, false);
  if (!prepared.ok) return prepared.response;
  const parsed = parseApplicationBody(prepared.body, true);
  if (!parsed) return invalid();
  if (!approvedConsentText("partnerApplication", parsed.consentPolicyVersion)) return unavailable();
  try {
    const result = await submitReferredApplication(referralCode, parsed.upstream);
    return respond({ status: "OK", publicReference: result.publicReference }, 200);
  } catch (error) {
    return mapError(error);
  }
}

// --- customer referral (a partner's personal link or QR) ---------------------

export type CustomerHandoff =
  | { status: "REDIRECT"; url: string }
  | { status: "OFF" | "LINK_UNAVAILABLE" | "SERVICE_UNAVAILABLE" };

/**
 * The /r/<code> page for a Partner's customer link or QR: records the visit
 * through SalesChain's existing attribution session and returns the customer
 * site address to continue to. There is no form, no product list and no
 * enquiry on this host. Closed unless AFFILIATE_CUSTOMER_SITE_URL names a
 * valid destination; failures collapse to the same small vocabulary as the
 * BFF (an unknown code, an inactive asset and a refused request look alike).
 */
export async function customerReferralHandoff(code: string, tracking: HandoffTracking & { qr?: string; v?: string }): Promise<CustomerHandoff> {
  const destination = customerSiteDestination();
  if (!destination) return { status: "OFF" };
  const referralCode = parseReferralCode(code);
  if (!referralCode) return { status: "LINK_UNAVAILABLE" };
  try {
    const context = await resolveCustomerReferral(referralCode, tracking);
    if (!context.attributionCorrelationId) return { status: "SERVICE_UNAVAILABLE" };
    return { status: "REDIRECT", url: handoffUrl(destination, context.attributionCorrelationId, tracking) };
  } catch (error) {
    if (error instanceof SalesChainError && error.kind === "rejected") return { status: "LINK_UNAVAILABLE" };
    return { status: "SERVICE_UNAVAILABLE" };
  }
}

export async function customerReferralContext(request: Request, code: string): Promise<Response> {
  if (!customerReferralsEnabled()) return unavailable();
  const referralCode = parseReferralCode(code);
  if (!referralCode) return unavailable();
  const prepared = await prepare(request, true);
  if (!prepared.ok) return prepared.response;
  const tracking = parseContextRequest(prepared.body, true);
  if (tracking === null) return invalid();
  if (!anyApprovedConsent("customerReferral")) return consentPendingResponse();
  try {
    return contextResponse(await resolveCustomerReferral(referralCode, tracking), "customerReferral");
  } catch (error) {
    return mapError(error);
  }
}

export async function customerReferralSubmit(request: Request, code: string): Promise<Response> {
  if (!customerReferralsEnabled()) return unavailable();
  const referralCode = parseReferralCode(code);
  if (!referralCode) return unavailable();
  const prepared = await prepare(request, false);
  if (!prepared.ok) return prepared.response;
  const parsed = parseReferralLeadBody(prepared.body);
  if (!parsed) return invalid();
  if (!approvedConsentText("customerReferral", parsed.consentPolicyVersion)) return unavailable();
  try {
    await submitCustomerReferral(referralCode, parsed.upstream);
    // One uniform answer, no reference: a visitor must not be able to tell a
    // new registration from one SalesChain already holds (see below).
    return respond({ status: "OK" }, 200);
  } catch (error) {
    // SalesChain answers 409 when this contact is already registered for the
    // product. For the visitor that is the same outcome as a new registration
    // (their interest is on record), and it makes a retry after a lost answer
    // safe; showing a different result would also reveal whether an e-mail
    // address is already known.
    if (error instanceof SalesChainError && error.kind === "rejected" && error.httpStatus === 409) {
      return respond({ status: "OK" }, 200);
    }
    return mapError(error);
  }
}
