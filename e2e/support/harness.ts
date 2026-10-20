import type { APIRequestContext, BrowserContext, Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** What the seed script (saleschain: e2e-affiliate-seed.ts) wrote. */
export type Seed = {
  tenantId: string;
  programmeId: string;
  programmeSlug: string;
  consentPolicyVersion: string;
  partnerId: string;
  product: { code: string; name: string };
  customerReferral: { code: string; qr: string; version: number; profileId: string };
  recruitment: { code: string; qr: string; version: number; profileId: string };
  /** A locally signed session of the fixture's Business Admin (full-journey test only). */
  businessAdmin: { membershipId: string; token: string };
};

export const seed = JSON.parse(readFileSync(process.env.E2E_SEED_FILE ?? "", "utf8")) as Seed;

// Must equal the values in playwright.real-api.config.ts.
export const SITE_PASSWORD = "e2e-site-access-password";
export const TURNSTILE_HOSTNAME = "affiliate.fertig-haus.net";
/** The local SalesChain API (PORTS.api); used directly only for the Business Admin's own calls. */
export const SALESCHAIN_API = "http://127.0.0.1:4461";

const PSQL = process.env.PSQL ?? "C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe";

/** One value from the disposable local database (read-only checks; the same guarded URL the API uses). */
export function sql(query: string): string {
  return execFileSync(PSQL, ["-X", "-A", "-t", "-q", process.env.SALESCHAIN_INTEGRATION_DIRECT_URL ?? "", "-c", query], {
    encoding: "utf8",
  }).trim();
}

export function count(table: string, where = "true"): number {
  return Number(sql(`select count(*) from "${table}" where "tenantId"='${seed.tenantId}' and ${where}`));
}

/** Row counts that must not move while a journey is closed or a submission refused. */
export function footprint() {
  return {
    applications: count("PartnerApplication"),
    leads: count("Lead"),
    attributionSessions: count("AttributionSession"),
    consentEvidence: count("ConsentEvidence"),
    commissions: count("CommissionEntry"),
    audit: count("AuditEvent"),
  };
}

export const unique = (label: string) => `${label}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@example.invalid`;

/** Passes the pre-launch password boundary exactly as a visitor does: a form POST that sets the access cookie. */
export async function unlock(target: BrowserContext | APIRequestContext, baseURL: string) {
  const request = "request" in target ? target.request : target;
  const response = await request.post(`${baseURL}/`, {
    form: { password: SITE_PASSWORD },
    maxRedirects: 0,
  });
  if (response.status() !== 303) throw new Error(`unlock failed: ${response.status()}`);
}

/**
 * Replaces Cloudflare's widget script with a local stub that mints the token grammar the local
 * siteverify stand-in understands. `modes` are consumed one per widget render; afterwards every
 * render is "ok". Modes: ok | bad | wrongaction | wronghost.
 */
export async function installTurnstile(page: Page, modes: string[] = []) {
  await page.addInitScript((queue) => {
    (window as unknown as { __tsQueue: string[] }).__tsQueue = queue;
    (window as unknown as { __tsActions: string[] }).__tsActions = [];
  }, modes);
  await page.route("https://challenges.cloudflare.com/turnstile/v0/api.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `
        window.turnstile = {
          render(container, options) {
            const mode = (window.__tsQueue && window.__tsQueue.shift()) || "ok";
            window.__tsActions.push(options.action);
            const action = mode === "wrongaction" ? "partner-invitation-acceptance" : options.action;
            const host = mode === "wronghost" ? "evil.example" : "${TURNSTILE_HOSTNAME}";
            const token = mode === "bad" ? "bad-token" : "ok|" + action + "|" + host;
            setTimeout(() => options.callback(token), 20);
            return "stub-" + window.__tsActions.length;
          },
          remove() {},
        };`,
    }),
  );
}

export const widgetActions = (page: Page) =>
  page.evaluate(() => (window as unknown as { __tsActions: string[] }).__tsActions);

export const sameOrigin = (baseURL: string) => ({ origin: baseURL, "content-type": "application/json" });
