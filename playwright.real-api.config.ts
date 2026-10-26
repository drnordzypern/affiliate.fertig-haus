/**
 * End-to-end test of the public journeys against the REAL local SalesChain API
 * and a disposable local database. Opt-in; see docs/local-real-api-e2e.md.
 *
 * Playwright is not a dependency of this repository (adding it would rewrite
 * the lockfile). Run it with the Playwright of the SalesChain checkout:
 *   NODE_PATH=<saleschain>/apps/web/node_modules  npx playwright test -c <this file>
 *
 * Starts: the built SalesChain API (review mode, local disposable database,
 * Turnstile answered by a local stand-in), this app as shipped (consent
 * registry empty), and a second copy of this app whose consent registry carries
 * clearly-labelled FIXTURE wording. The app servers are addressed as `localhost` on purpose: in `next dev`
 * a route handler sees request.url as http://localhost:<port> whatever the Host header is, so the BFF
 * same-origin check only matches a browser that also says localhost. Nothing here can reach production: the
 * database URL comes only from the guarded SALESCHAIN_INTEGRATION_* variables,
 * no e-mail is sent, and the API base URL is a loopback address.
 */
import { defineConfig } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

const salesChainDir = process.env.SALESCHAIN_REPO_DIR ?? path.resolve(__dirname, "../saleschain-integration");
const pooled = process.env.SALESCHAIN_INTEGRATION_DATABASE_URL ?? "";
const direct = process.env.SALESCHAIN_INTEGRATION_DIRECT_URL ?? "";
const secret = process.env.E2E_AUTH_SESSION_SECRET ?? "";
const seedFile = process.env.E2E_SEED_FILE ?? "";
if (!pooled.includes("/saleschain_integration_") || !secret || !seedFile) {
  throw new Error(
    "real-api e2e: set the disposable SALESCHAIN_INTEGRATION_* database, E2E_AUTH_SESSION_SECRET and E2E_SEED_FILE (see docs/local-real-api-e2e.md)",
  );
}
const { databaseIdentityFingerprint } = require(path.join(salesChainDir, "packages/config")) as {
  databaseIdentityFingerprint(url: string): string;
};
const seed = JSON.parse(readFileSync(seedFile, "utf8")) as { tenantId: string; programmeId: string; consentPolicyVersion: string };
const url = new URL(pooled);
const localDatabaseName = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ? url.pathname.replace(/^\//, "") : "";

export const PORTS = { api: 4461, shipped: 3461, fixture: 3462 };
export const SITE_PASSWORD = "e2e-site-access-password";
const SITE_SECRET = "e2e-site-access-secret-0123456789abcdef";
export const TURNSTILE_SECRET = "e2e-turnstile-standin-secret";
export const TURNSTILE_HOSTNAME = process.env.E2E_PUBLIC_HOST || "affiliate.fertig-haus.net";

const appEnv = (journeys: "on" | "off") => ({
  SALESCHAIN_API_BASE_URL: `http://127.0.0.1:${PORTS.api}`,
  AFFILIATE_SITE_ACCESS_PASSWORD: SITE_PASSWORD,
  AFFILIATE_SITE_ACCESS_SECRET: SITE_SECRET,
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "e2e-site-key",
  AFFILIATE_PARTNER_APPLICATIONS_ENABLED: journeys === "on" ? "true" : "",
  AFFILIATE_CUSTOMER_REFERRALS_ENABLED: journeys === "on" ? "true" : "",
  E2E_CONSENT_VERSION: seed.consentPolicyVersion,
  // empty = the production default host; E2E_PUBLIC_HOST proves the configurable test host end to end
  AFFILIATE_PUBLIC_HOST: process.env.E2E_PUBLIC_HOST ?? "",
});

export default defineConfig({
  testDir: "./e2e",
  testMatch: "*.e2e.ts",
  timeout: 120_000,
  workers: 1,
  fullyParallel: false,
  expect: { timeout: 20_000 },
  outputDir: process.env.E2E_OUTPUT_DIR ?? "./.next/real-api-e2e-results",
  reporter: process.env.E2E_RESULTS_JSON
    ? [["line"], ["json", { outputFile: process.env.E2E_RESULTS_JSON }]]
    : [["line"]],
  use: { trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    // The whole chain on the fixture copy: application, Business Admin approval, invitation, customer enquiry, CRM.
    // First: the consent-fixture rate-limit test saturates the direct-application bucket on purpose.
    { name: "journey", testMatch: "journey.e2e.ts", use: { baseURL: `http://localhost:${PORTS.fixture}` } },
    // As shipped: no consent wording approved, journeys closed unless the gates are set.
    { name: "shipped", testMatch: "shipped.e2e.ts", use: { baseURL: `http://localhost:${PORTS.shipped}` } },
    // A copy with clearly-labelled fixture wording, so the forms that only exist once wording is approved can run.
    { name: "consent-fixture", testMatch: "consent-fixture.e2e.ts", use: { baseURL: `http://localhost:${PORTS.fixture}` } },
    // The same shipped source with the feature gates left UNSET (the default): everything must stay closed.
    { name: "gates-closed", testMatch: "gates-closed.e2e.ts", use: { baseURL: `http://localhost:${PORTS.fixture + 1}` } },
    { name: "visual", testMatch: "visual.e2e.ts", use: { baseURL: `http://localhost:${PORTS.fixture}` } },
  ],
  webServer: [
    {
      command: "node apps/api/dist/main.js",
      cwd: salesChainDir,
      url: `http://127.0.0.1:${PORTS.api}/v1/health/ready`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        NODE_ENV: "production",
        NODE_OPTIONS: `--require=${path.join(__dirname, "e2e/support/cloudflare-standin.cjs")}`,
        E2E_TURNSTILE_SECRET: TURNSTILE_SECRET,
        API_PORT: String(PORTS.api),
        APP_MODE: "review",
        DATABASE_ENVIRONMENT: "review",
        DATABASE_URL: pooled,
        DIRECT_URL: direct,
        DATABASE_IDENTITY_FINGERPRINT: databaseIdentityFingerprint(pooled),
        ...(localDatabaseName ? { LOCAL_INTEGRATION_TEST_DATABASE_NAME: localDatabaseName } : {}),
        FICTIONAL_ACCESS_ENABLED: "false",
        GOOGLE_WORKSPACE_ENABLED: "false",
        WEB_ORIGIN: `http://localhost:${PORTS.shipped}`,
        AUTH_SESSION_SECRET: secret,
        // The two public journeys, in the review-mode form the API supports locally.
        PUBLIC_PARTNER_APPLICATIONS_ENABLED: "true",
        PUBLIC_REFERRAL_INTAKE_ENABLED: "true",
        PUBLIC_PARTNER_APPLICATIONS_DIRECT_PROGRAMME_SLUG: "fertig-haus-affiliate-system",
        PUBLIC_REFERRAL_RATE_LIMIT_MODE: "database",
        // Partner access after approval (invitation acceptance and the partner session), as in production.
        PARTNER_SESSION_ENABLED: "true",
        PUBLIC_PARTNER_INVITATION_ACCEPTANCE_ENABLED: "true",
        // Sales email-code sessions (issued locally by the seed); the "fake" provider sends no e-mail.
        STAFF_EMAIL_OTP_LOGIN_ENABLED: "true",
        STAFF_LOGIN_CODE_PEPPER: `${secret}-pepper`,
        STAFF_LOGIN_EMAIL_PROVIDER: "fake",
        STAFF_LOGIN_EMAIL_FROM: "e2e-sender@example.invalid",
        // A Business Admin's manual retention run (the journey's last step); no worker, no schedule.
        CRM_PRIVACY_RETENTION_EXECUTION_ENABLED: "true",
        TURNSTILE_SECRET_KEY: TURNSTILE_SECRET,
        TURNSTILE_ALLOWED_HOSTNAMES: TURNSTILE_HOSTNAME,
        PUBLIC_PORTAL_HOST: process.env.E2E_PUBLIC_HOST ?? "",
      },
    },
    {
      command: `node node_modules/next/dist/bin/next dev -p ${PORTS.shipped}`,
      cwd: __dirname,
      url: `http://localhost:${PORTS.shipped}/robots.txt`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: appEnv("on"),
    },
    {
      command: `node e2e/support/prepare-fixture-copy.mjs fixture && cd .e2e-consent-copy && node node_modules/next/dist/bin/next dev -p ${PORTS.fixture}`,
      cwd: __dirname,
      url: `http://localhost:${PORTS.fixture}/robots.txt`,
      reuseExistingServer: false,
      timeout: 240_000,
      env: appEnv("on"),
    },
    {
      command: `node e2e/support/prepare-fixture-copy.mjs plain && cd .e2e-gates-closed-copy && node node_modules/next/dist/bin/next dev -p ${PORTS.fixture + 1}`,
      cwd: __dirname,
      url: `http://localhost:${PORTS.fixture + 1}/robots.txt`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: appEnv("off"),
    },
  ],
});
