/**
 * Server-only feature gates for the two public journeys.
 *
 * Both default CLOSED: with the variable unset, empty or anything other than
 * the exact string "true", the matching pages show an honest "not available"
 * state and the matching BFF routes answer 404 before any upstream call, any
 * Turnstile check or any database access on the SalesChain side.
 *
 * They are separate on purpose, mirroring the two separate SalesChain API
 * gates, so that opening one journey can never open the other:
 *   - partner applications: a prospective partner applies (`/apply`,
 *     `/apply/<code>`), creating an application in review and nothing else;
 *   - customer referrals: a prospective customer registers interest after a
 *     partner's personal link or QR (`/r/<code>`), creating a lead with
 *     partner attribution.
 *
 * Neither flag is read in a Client Component: pages receive the result as a
 * prop, so the decision is never inlined into browser JavaScript.
 */
export function partnerApplicationsEnabled(): boolean {
  return process.env.AFFILIATE_PARTNER_APPLICATIONS_ENABLED === "true";
}

export function customerReferralsEnabled(): boolean {
  return process.env.AFFILIATE_CUSTOMER_REFERRALS_ENABLED === "true";
}
