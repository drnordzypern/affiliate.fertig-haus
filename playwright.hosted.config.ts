/**
 * The public-journey end-to-end test against a DEPLOYED, PROTECTED test environment (E2E_HOSTED=1): the real Cloudflare Turnstile widget,
 * the real site password, the test API and its isolated database. Opt-in; nothing starts locally. Never point it at Production: the guarded
 * SALESCHAIN_INTEGRATION_DIRECT_URL (database name saleschain_integration_*) is what the journey's database checks read.
 *
 * Required environment (values come from the operator's shell, never from this file):
 *   E2E_HOSTED=1  E2E_AFFILIATE_URL=https://<test affiliate host>  E2E_API_URL=https://<test API host>
 *   E2E_SITE_PASSWORD  E2E_API_BYPASS  E2E_AFFILIATE_BYPASS  E2E_SEED_FILE  SALESCHAIN_INTEGRATION_DIRECT_URL  (E2E_PUBLIC_HOST = the affiliate host)
 * Run with the Playwright of the SalesChain checkout:  NODE_PATH=<saleschain>/apps/web/node_modules npx playwright test -c playwright.hosted.config.ts
 */
import { defineConfig } from "@playwright/test";

const affiliate = process.env.E2E_AFFILIATE_URL ?? "";
const api = process.env.E2E_API_URL ?? "";
const database = process.env.SALESCHAIN_INTEGRATION_DIRECT_URL ?? "";
if (process.env.E2E_HOSTED !== "1" || !/^https:\/\//.test(affiliate) || !/^https:\/\//.test(api) || !process.env.E2E_SEED_FILE || !database.includes("/saleschain_integration_"))
  throw new Error("hosted e2e: set E2E_HOSTED=1, E2E_AFFILIATE_URL, E2E_API_URL (https), E2E_SEED_FILE and the guarded SALESCHAIN_INTEGRATION_DIRECT_URL (see the header of this file)");
for (const [name, value] of Object.entries({ affiliate, api })) {
  if (/(^|\/\/)(affiliate\.fertig-haus\.net|saleschain-review-(api|web)\.vercel\.app)/.test(value)) throw new Error(`hosted e2e: refusing a Production host as ${name}`);
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: "journey.e2e.ts",
  timeout: process.env.E2E_HEADED === "1" ? 600_000 : 240_000,
  workers: 1,
  fullyParallel: false,
  expect: { timeout: process.env.E2E_HEADED === "1" ? 180_000 : 45_000 },
  outputDir: process.env.E2E_OUTPUT_DIR ?? "./.next/hosted-e2e-results",
  reporter: process.env.E2E_RESULTS_JSON ? [["line"], ["json", { outputFile: process.env.E2E_RESULTS_JSON }]] : [["line"]],
  use: { baseURL: affiliate, trace: "retain-on-failure", screenshot: "only-on-failure", video: process.env.E2E_VIDEO === "1" ? "on" : "off" },
  // E2E_HEADED=1 opens a visible browser window: the real Cloudflare Turnstile widget may show a "Verify you are human" box, which a PERSON ticks (the test never
  // clicks, bypasses or fakes it); the test simply waits for the widget to issue its token (the expect timeout below is long enough for that).
  projects: [{ name: "hosted-journey", use: { channel: "msedge", headless: process.env.E2E_HEADED !== "1", launchOptions: { slowMo: process.env.E2E_HEADED === "1" ? 150 : 0 } } }],
});
