import { expect, test, type Page } from "@playwright/test";
import { installTurnstile, seed, unlock } from "./support/harness";
import { appendFileSync, mkdirSync } from "node:fs";

// Visual and layout pass of the public journeys at phone, tablet and desktop width. Screenshots go to
// E2E_SHOTS (outside the repository). Fixture wording is shown only in the fixture server; the shipped and
// closed states are captured from their own servers.
const OUT = process.env.E2E_SHOTS ?? "./.next/visual-shots";
mkdirSync(OUT, { recursive: true });
const SIZES = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 820, height: 1100 },
  { name: "desktop", width: 1360, height: 900 },
] as const;
const SERVERS = { shipped: "http://localhost:3461", fixture: "http://localhost:3462", closed: "http://localhost:3463" };
const pages = (code: { r: string; c: string; qr: string }) => ({
  direct: "/apply",
  referred: `/apply/${code.r}?qr=${code.qr}&v=1`,
  referral: `/r/${code.c}?qr=${code.qr}&v=1`,
});

async function noOverflow(page: Page) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(wide, "horizontal overflow").toBeLessThanOrEqual(0);
}

for (const [server, base] of Object.entries(SERVERS)) {
  for (const size of SIZES) {
    test(`${server} states at ${size.name}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width: size.width, height: size.height } });
      await unlock(context, base);
      const urls = pages({ r: seed.recruitment.code, c: seed.customerReferral.code, qr: seed.customerReferral.qr });
      for (const [name, path] of Object.entries(urls)) {
        const page = await context.newPage();
        page.on("console", (m) => { if (["error", "warning"].includes(m.type())) appendFileSync(`${OUT}/console.log`, `${server} ${name} ${size.name} [${m.type()}] ${m.text().slice(0, 400)}\n`); });
        page.on("pageerror", (e) => appendFileSync(`${OUT}/console.log`, `${server} ${name} ${size.name} [pageerror] ${String(e.message).slice(0, 400)}\n`));
        await installTurnstile(page);
        await page.goto(`${base}${path.replace(seed.customerReferral.qr, name === "referred" ? seed.recruitment.qr : seed.customerReferral.qr)}`);
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(600);
        await noOverflow(page);
        await page.screenshot({ path: `${OUT}/${server}-${name}-${size.name}.png`, fullPage: true });
        await page.close();
      }
      await context.close();
    });
  }
}