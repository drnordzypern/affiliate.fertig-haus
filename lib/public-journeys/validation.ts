/**
 * Strict request validation for the public-journey BFF routes. Mirrors the
 * SalesChain contracts (packages/contracts: programmePartnerApplicationSubmit,
 * directPartnerApplicationSubmit, programmeReferralLead) so a bad request is
 * refused here, cheaply, without an upstream call. SalesChain re-validates
 * everything; nothing here is authoritative.
 *
 * Rules shared by every parser: the body must be a plain object with EXACTLY
 * the allowed keys (unknown keys are refused, never ignored or forwarded), and
 * the upstream body is built field by field from validated values.
 */

export const PARTNER_TYPES = [
  "AFFILIATE_CONTENT_CREATOR",
  "PRIVATE_REFERRER",
  "BROKER_SALES_PROFESSIONAL",
  "MANUFACTURER_PROVIDER",
  "DEVELOPER_CONSTRUCTION_COMPANY",
  "MEDIA_ADVERTISING_PARTNER",
  "OTHER",
] as const;
export type PartnerType = (typeof PARTNER_TYPES)[number];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_PATTERN = /^[A-Za-z0-9_-]{16,80}$/;
const QR_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;
const QR_VERSION_PATTERN = /^[1-9]\d{0,5}$/;
const PRODUCT_CODE_PATTERN = /^[A-Z0-9-]{2,40}$/;
/** SalesChain keeps only plain campaign words; anything else is dropped upstream, so it is never sent. */
const TRACKING_PATTERN = /^[A-Za-z0-9._~ -]{1,120}$/;

type Plain = Record<string, unknown>;

function isPlainObject(value: unknown): value is Plain {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(record: Plain, allowed: readonly string[]): boolean {
  return Object.keys(record).every((key) => allowed.includes(key));
}

/** A required string, trimmed, with a length range. */
function text(record: Plain, key: string, min: number, max: number): string | null {
  const value = record[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length >= min && trimmed.length <= max ? trimmed : null;
}

/**
 * An optional string: absent, null or blank means "not provided" (undefined);
 * present but too long, or not a string, is invalid (null).
 */
function optionalText(record: Plain, key: string, max: number): string | undefined | null {
  const value = record[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  return trimmed.length <= max ? trimmed : null;
}

export function parseReferralCode(value: unknown): string | null {
  return typeof value === "string" && CODE_PATTERN.test(value) ? value : null;
}

export type ParsedContextRequest = {
  qr?: string;
  v?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
};

const CONTEXT_KEYS = ["qr", "v", "utmSource", "utmMedium", "utmCampaign", "utmTerm", "utmContent"] as const;

/**
 * The scanned-QR identifiers and campaign values of the landing URL. `qr` and
 * `v` come as a pair or not at all: a half-present or malformed pair is
 * refused rather than silently downgraded, because dropping it would record a
 * scan as an ordinary link visit. Campaign values that are not plain words are
 * dropped (they are optional attribution detail, never identity).
 */
export function parseContextRequest(body: unknown, allowTracking: boolean): ParsedContextRequest | null {
  if (body === undefined || body === null) return {};
  if (!isPlainObject(body) || !hasOnlyKeys(body, CONTEXT_KEYS)) return null;

  const result: ParsedContextRequest = {};
  const qr = body.qr;
  const v = body.v;
  if ((qr === undefined) !== (v === undefined)) return null;
  if (qr !== undefined) {
    if (typeof qr !== "string" || !QR_PATTERN.test(qr)) return null;
    if (typeof v !== "string" || !QR_VERSION_PATTERN.test(v)) return null;
    result.qr = qr;
    result.v = v;
  }

  if (allowTracking) {
    for (const key of ["utmSource", "utmMedium", "utmCampaign", "utmTerm", "utmContent"] as const) {
      const value = body[key];
      if (value === undefined) continue;
      if (typeof value !== "string") return null;
      if (TRACKING_PATTERN.test(value)) result[key] = value;
    }
  } else if (CONTEXT_KEYS.slice(2).some((key) => body[key] !== undefined)) {
    return null;
  }
  return result;
}

export type ParsedApplication = {
  /** The consent policy version the form displayed; checked by the BFF, never forwarded. */
  consentPolicyVersion: string;
  /** Referred applications only. */
  attributionCorrelationId?: string;
  upstream: Record<string, unknown>;
};

const APPLICATION_KEYS = [
  "name",
  "email",
  "phone",
  "company",
  "partnerType",
  "region",
  "websiteOrSocialProfile",
  "message",
  "consentToApply",
  "idempotencyKey",
  "turnstileToken",
  "consentPolicyVersion",
  "attributionCorrelationId",
] as const;

export function parseApplicationBody(body: unknown, referred: boolean): ParsedApplication | null {
  if (!isPlainObject(body) || !hasOnlyKeys(body, APPLICATION_KEYS)) return null;

  const name = text(body, "name", 2, 120);
  const email = text(body, "email", 3, 254);
  const phone = text(body, "phone", 6, 40);
  const company = optionalText(body, "company", 160);
  const region = optionalText(body, "region", 120);
  const profile = optionalText(body, "websiteOrSocialProfile", 500);
  const message = optionalText(body, "message", 2_000);
  const turnstileToken = text(body, "turnstileToken", 1, 2_048);
  const consentPolicyVersion = text(body, "consentPolicyVersion", 1, 80);
  const idempotencyKey = body.idempotencyKey;
  const partnerType = body.partnerType;

  if (!name || !email || !phone || !turnstileToken || !consentPolicyVersion) return null;
  if (company === null || region === null || profile === null || message === null) return null;
  if (!EMAIL_PATTERN.test(email)) return null;
  if (phone.replace(/\D/g, "").length < 6) return null;
  if (body.consentToApply !== true) return null;
  if (typeof idempotencyKey !== "string" || !UUID_PATTERN.test(idempotencyKey)) return null;
  if (typeof partnerType !== "string" || !(PARTNER_TYPES as readonly string[]).includes(partnerType)) return null;

  let attributionCorrelationId: string | undefined;
  if (referred) {
    const id = body.attributionCorrelationId;
    if (typeof id !== "string" || !UUID_PATTERN.test(id)) return null;
    attributionCorrelationId = id;
  } else if (body.attributionCorrelationId !== undefined) {
    return null;
  }

  return {
    consentPolicyVersion,
    ...(attributionCorrelationId ? { attributionCorrelationId } : {}),
    upstream: {
      name,
      email,
      phone,
      ...(company ? { company } : {}),
      partnerType,
      ...(region ? { region } : {}),
      ...(profile ? { websiteOrSocialProfile: profile } : {}),
      ...(message ? { message } : {}),
      consentToApply: true,
      ...(attributionCorrelationId ? { attributionCorrelationId } : {}),
      idempotencyKey,
      turnstileToken,
    },
  };
}

export type ParsedReferralLead = {
  consentPolicyVersion: string;
  upstream: Record<string, unknown>;
};

const REFERRAL_KEYS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "productCode",
  "consentToContact",
  "attributionCorrelationId",
  "turnstileToken",
  "consentPolicyVersion",
] as const;

export function parseReferralLeadBody(body: unknown): ParsedReferralLead | null {
  if (!isPlainObject(body) || !hasOnlyKeys(body, REFERRAL_KEYS)) return null;

  const firstName = text(body, "firstName", 1, 100);
  const lastName = text(body, "lastName", 1, 100);
  const email = optionalText(body, "email", 254);
  const phone = optionalText(body, "phone", 30);
  const productCode = body.productCode;
  const turnstileToken = text(body, "turnstileToken", 1, 2_048);
  const consentPolicyVersion = text(body, "consentPolicyVersion", 1, 80);
  const correlation = body.attributionCorrelationId;

  if (!firstName || !lastName || !turnstileToken || !consentPolicyVersion) return null;
  if (email === null || phone === null) return null;
  if (!email && !phone) return null;
  if (email && !EMAIL_PATTERN.test(email)) return null;
  if (phone && phone.length < 7) return null;
  if (typeof productCode !== "string" || !PRODUCT_CODE_PATTERN.test(productCode)) return null;
  if (body.consentToContact !== true) return null;
  if (typeof correlation !== "string" || !UUID_PATTERN.test(correlation)) return null;

  return {
    consentPolicyVersion,
    upstream: {
      firstName,
      lastName,
      ...(email ? { email } : {}),
      ...(phone ? { phone } : {}),
      productCode,
      consentToContact: true,
      attributionCorrelationId: correlation,
      turnstileToken,
    },
  };
}
