/**
 * The Partner link/QR handoff to the customer site.
 *
 * A Partner's personal customer link (/r/<code>[?qr=..&v=..&utm_*]) no longer
 * shows a form on this subdomain. After SalesChain has recorded the visit in
 * its attribution session (the existing mechanism, including its expiry), the
 * visitor is sent on to the customer site, which keeps its own browsing,
 * house selection, configurator and enquiry form. The only thing added to the
 * destination is `ref`: the id of that attribution session, which the
 * customer site passes back to SalesChain unchanged with the enquiry so the
 * Partner can be credited.
 *
 * The destination is configuration (AFFILIATE_CUSTOMER_SITE_URL): a test
 * environment points it at its own customer-site stand-in and never at the
 * live site. Unset or invalid, the handoff stays closed.
 */
export const CUSTOMER_SITE_ENV = "AFFILIATE_CUSTOMER_SITE_URL";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const REFERENCE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TRACKING_LENGTH = 120;

/** The configured destination, or null (closed) when missing or unsafe. */
export function customerSiteDestination(
  env: Readonly<Record<string, string | undefined>> = process.env
): URL | null {
  const raw = env[CUSTOMER_SITE_ENV]?.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const local = LOCAL_HOSTS.has(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return null;
  if (url.username || url.password) return null;
  // The destination is an address, not a template: nothing may already ride on it.
  if (url.search || url.hash) return null;
  return url;
}

export type HandoffTracking = {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
};

const TRACKING_PARAMS: ReadonlyArray<readonly [keyof HandoffTracking, string]> = [
  ["utmSource", "utm_source"],
  ["utmMedium", "utm_medium"],
  ["utmCampaign", "utm_campaign"],
  ["utmTerm", "utm_term"],
  ["utmContent", "utm_content"],
];

/**
 * The destination plus `ref` and the campaign values the Partner link already
 * carried (so the customer site's own campaign capture keeps working). The QR
 * pair is not forwarded: it only matters to the attribution session.
 */
export function handoffUrl(destination: URL, attributionSessionRef: string, tracking: HandoffTracking = {}): string {
  if (!REFERENCE.test(attributionSessionRef)) throw new Error("The attribution reference is not valid.");
  const url = new URL(destination.href);
  url.searchParams.set("ref", attributionSessionRef.toLowerCase());
  for (const [key, param] of TRACKING_PARAMS) {
    const value = tracking[key];
    if (value && value.length <= MAX_TRACKING_LENGTH) url.searchParams.set(param, value);
  }
  return url.toString();
}
