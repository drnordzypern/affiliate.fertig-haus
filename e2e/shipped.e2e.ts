import { expect, test } from "@playwright/test";
import { footprint, installTurnstile, sameOrigin, seed, unlock, widgetActions } from "./support/harness";

// The application AS SHIPPED: no consent wording is approved (the registry is empty), the two
// feature gates are open. Everything that needs a submission path must stay closed, and nothing
// may be written to SalesChain, until wording exists for the policy version SalesChain reports.
const PENDING = /erst verfügbar, sobald der Einwilligungstext freigegeben ist/;
const urls = {
  direct: "/apply",
  referred: `/apply/${seed.recruitment.code}?qr=${seed.recruitment.qr}&v=${seed.recruitment.version}`,
  referral: `/r/${seed.customerReferral.code}?qr=${seed.customerReferral.qr}&v=${seed.customerReferral.version}&utm_source=newsletter`,
};

test("the pre-launch password boundary still guards every page and route", async ({ browser, baseURL }) => {
  const context = await browser.newContext();
  const anonymous = context.request;
  for (const path of [urls.direct, urls.referred, urls.referral]) {
    const response = await anonymous.get(`${baseURL}${path}`);
    expect(response.status(), path).toBe(401);
    expect(await response.text()).not.toContain("Bewerbung");
  }
  const bff = await anonymous.post(`${baseURL}/api/applications/direct/context`, { headers: sameOrigin(baseURL!), data: {} });
  expect(bff.status()).toBe(401);

  await unlock(context, baseURL!);
  for (const path of [urls.direct, urls.referred, urls.referral]) {
    expect((await context.request.get(`${baseURL}${path}`)).status(), path).toBe(200);
  }
  await context.close();
});

test("wording not released: each page says so, shows no form, and SalesChain records nothing", async ({ browser, baseURL }) => {
  const context = await browser.newContext();
  await unlock(context, baseURL!);
  const before = footprint();
  for (const path of [urls.direct, urls.referred, urls.referral]) {
    const page = await context.newPage();
    await installTurnstile(page);
    await page.goto(`${baseURL}${path}`);
    await expect(page.getByText(PENDING)).toBeVisible();
    await expect(page.getByRole("form")).toHaveCount(0);
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /absenden/ })).toHaveCount(0);
    expect(await widgetActions(page)).toEqual([]);
    await page.close();
  }
  // not even an attribution session is created for a page nobody can use
  expect(footprint()).toEqual(before);
  await context.close();
});

test("the BFF cannot be used to bypass the missing wording: a direct POST is refused and records nothing", async ({ browser, baseURL }) => {
  const context = await browser.newContext();
  await unlock(context, baseURL!);
  const before = footprint();
  const valid = {
    name: "Erika Muster",
    email: "bypass@example.invalid",
    phone: "+49 170 0000000",
    partnerType: "PRIVATE_REFERRER",
    consentToApply: true,
    idempotencyKey: "30000000-0000-4000-8000-000000000003",
    turnstileToken: `ok|partner-application-direct|affiliate.fertig-haus.net`,
    consentPolicyVersion: seed.consentPolicyVersion,
  };
  const direct = await context.request.post(`${baseURL}/api/applications/direct`, { headers: sameOrigin(baseURL!), data: valid });
  expect(direct.status()).toBe(404);
  expect(await direct.json()).toEqual({ status: "UNAVAILABLE" });
  const referred = await context.request.post(`${baseURL}/api/applications/referred/${seed.recruitment.code}`, {
    headers: sameOrigin(baseURL!),
    data: { ...valid, attributionCorrelationId: "20000000-0000-4000-8000-000000000002" },
  });
  expect(referred.status()).toBe(404);
  const lead = await context.request.post(`${baseURL}/api/referrals/${seed.customerReferral.code}/leads`, {
    headers: sameOrigin(baseURL!),
    data: {
      firstName: "Erika",
      lastName: "Muster",
      email: "bypass@example.invalid",
      productCode: seed.product.code,
      consentToContact: true,
      attributionCorrelationId: "20000000-0000-4000-8000-000000000002",
      turnstileToken: "ok|customer-referral-lead|affiliate.fertig-haus.net",
      consentPolicyVersion: seed.consentPolicyVersion,
    },
  });
  expect(lead.status()).toBe(404);
  expect(footprint()).toEqual(before);
  await context.close();
});

test("a cross-origin or origin-less request to the BFF is refused even with the access cookie", async ({ browser, baseURL }) => {
  const context = await browser.newContext();
  await unlock(context, baseURL!);
  for (const origin of ["https://evil.example", undefined]) {
    const response = await context.request.post(`${baseURL}/api/applications/direct/context`, {
      headers: { "content-type": "application/json", ...(origin ? { origin } : {}) },
      data: {},
    });
    expect(response.status()).toBe(403);
  }
  await context.close();
});
