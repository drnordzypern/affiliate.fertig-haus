import { expect, test } from "@playwright/test";
import { footprint, installTurnstile, sameOrigin, seed, unlock } from "./support/harness";

// The shipped source with BOTH feature gates left unset (the default): every journey is closed,
// SalesChain is never contacted, and the visitor sees one honest, non-informative state.
const CLOSED = "Diese Seite ist derzeit nicht verfügbar.";

test("with the gates unset every page is closed and nothing reaches SalesChain", async ({ browser, baseURL }) => {
  const context = await browser.newContext();
  await unlock(context, baseURL!);
  const before = footprint();
  for (const path of [
    "/apply",
    `/apply/${seed.recruitment.code}?qr=${seed.recruitment.qr}&v=1`,
    `/r/${seed.customerReferral.code}?qr=${seed.customerReferral.qr}&v=1`,
  ]) {
    const page = await context.newPage();
    await installTurnstile(page);
    await page.goto(`${baseURL}${path}`);
    await expect(page.getByText(CLOSED)).toBeVisible();
    await expect(page.getByRole("form")).toHaveCount(0);
    await page.close();
  }
  expect(footprint()).toEqual(before);
  await context.close();
});

test("with the gates unset every BFF route answers 404, a valid-looking submission included", async ({ browser, baseURL }) => {
  const context = await browser.newContext();
  await unlock(context, baseURL!);
  const before = footprint();
  const post = (path: string, data: unknown) =>
    context.request.post(`${baseURL}${path}`, { headers: sameOrigin(baseURL!), data });
  const responses = await Promise.all([
    post("/api/applications/direct/context", {}),
    post("/api/applications/direct", { name: "x" }),
    post(`/api/applications/referred/${seed.recruitment.code}/context`, {}),
    post(`/api/applications/referred/${seed.recruitment.code}`, {}),
    post(`/api/referrals/${seed.customerReferral.code}/context`, {}),
    post(`/api/referrals/${seed.customerReferral.code}/leads`, {}),
  ]);
  expect(responses.map((response) => response.status())).toEqual([404, 404, 404, 404, 404, 404]);
  expect(footprint()).toEqual(before);
  await context.close();
});

test("the two journeys have separate gates: the closed state is identical for both", async ({ browser, baseURL }) => {
  const context = await browser.newContext();
  await unlock(context, baseURL!);
  const a = await context.request.post(`${baseURL}/api/applications/direct/context`, { headers: sameOrigin(baseURL!), data: {} });
  const r = await context.request.post(`${baseURL}/api/referrals/${seed.customerReferral.code}/context`, { headers: sameOrigin(baseURL!), data: {} });
  expect(await a.json()).toEqual(await r.json());
  await context.close();
});
