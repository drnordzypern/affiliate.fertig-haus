import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { count, footprint, installTurnstile, sameOrigin, seed, sql, unique, unlock, widgetActions } from "./support/harness";

// The forms that exist only once consent wording is approved, run against the REAL local SalesChain
// API and database. This server is a COPY of the application whose consent registry carries
// clearly-labelled FIXTURE wording for the seeded policy version (see e2e/support/prepare-fixture-copy.mjs).
// Nothing here is approved text; it only proves that, once wording exists, each journey creates exactly
// what it should and nothing else.
test.describe.configure({ mode: "serial" });

let context: BrowserContext;
test.beforeAll(async ({ browser, baseURL }) => {
  context = await browser.newContext();
  await unlock(context, baseURL!);
});
test.afterAll(async () => context.close());

async function open(path: string, modes: string[] = []): Promise<Page> {
  const page = await context.newPage();
  await installTurnstile(page, modes);
  await page.goto(path);
  return page;
}

async function fillApplication(page: Page, email: string, over: { name?: string } = {}) {
  await page.getByLabel("Vor- und Nachname").fill(over.name ?? "Erika Muster");
  await page.getByLabel("E-Mail-Adresse").fill(email);
  await page.getByLabel("Telefon").fill("+49 170 0000000");
  await page.selectOption("#partnerType", "PRIVATE_REFERRER");
  await page.getByLabel("Region / Bundesland (optional)").fill("Bayern");
  await page.getByLabel(/E2E fixture checkbox: partner application/).check();
}

const submitApplication = (page: Page) => page.getByRole("button", { name: "Bewerbung absenden" }).click();
const applicationRow = (email: string) =>
  sql(
    `select attribution, coalesce("referringPartnerId"::text,''), ("qrAssetId" is not null), source, status, "consentPolicyVersion", "partnerType", region from "PartnerApplication" where "tenantId"='${seed.tenantId}' and email='${email}'`,
  );
const applicationCount = (email: string) => count("PartnerApplication", `email='${email}'`);
const leadCount = (email: string) => count("Lead", `email='${email}'`);

const REFUSED = "Die Angaben konnten nicht angenommen werden. Bitte versuchen Sie es erneut.";

test.describe("partner application, direct", () => {
  test("shows the wording, creates exactly one application in review and nothing else", async ({ baseURL }) => {
    const email = unique("direct");
    const before = footprint();
    const page = await open("/apply");
    await expect(page.getByRole("form", { name: "Partnerbewerbung" })).toBeVisible();
    await expect(page.getByText(/E2E FIXTURE WORDING \(not approved text\): partner application statement/)).toBeVisible();
    const consent = page.getByLabel(/E2E fixture checkbox: partner application/);
    await expect(consent).not.toBeChecked();
    expect(await widgetActions(page)).toEqual(["partner-application-direct"]);

    await fillApplication(page, email);
    await submitApplication(page);
    const reference = await page.getByTestId("application-reference").textContent();
    expect(reference).toMatch(/^PA-\d{4}-[A-F0-9]{10}$/);
    await expect(page.getByText(/weder ein Zugang noch ein Partnerstatus noch ein Provisionsanspruch/)).toBeVisible();

    expect(applicationRow(email)).toBe(`DIRECT||f|PUBLIC_DIRECT_APPLICATION|PENDING|${seed.consentPolicyVersion}|PRIVATE_REFERRER|Bayern`);
    expect(sql(`select "publicReference" from "PartnerApplication" where "tenantId"='${seed.tenantId}' and email='${email}'`)).toBe(reference);
    const after = footprint();
    // one application and its audit event: no lead, no attribution session, no consent evidence, no commission
    expect(after.applications).toBe(before.applications + 1);
    expect({ ...after, applications: 0, audit: 0 }).toEqual({ ...before, applications: 0, audit: 0 });
    expect(after.audit).toBe(before.audit + 1);
    expect(leadCount(email)).toBe(0);
    await page.close();
  });

  test("a lost answer is retried with the same key: one application, the same reference", async ({ baseURL }) => {
    const email = unique("lost");
    const page = await open("/apply");
    let first = true;
    await page.route("**/api/applications/direct", async (route) => {
      if (first) {
        first = false;
        await route.fetch(); // the server accepts the application ...
        await route.abort("failed"); // ... but the visitor never sees the answer
        return;
      }
      await route.continue();
    });
    await fillApplication(page, email);
    await submitApplication(page);
    await expect(page.locator('form p[role="alert"]')).toContainText("Ihre Eingaben bleiben erhalten");
    expect(applicationCount(email)).toBe(1);
    // the inputs survived and a fresh challenge was rendered
    await expect(page.getByLabel("E-Mail-Adresse")).toHaveValue(email);
    await expect.poll(async () => (await widgetActions(page)).length).toBe(2);

    await submitApplication(page);
    const reference = await page.getByTestId("application-reference").textContent();
    expect(applicationCount(email)).toBe(1);
    expect(sql(`select "publicReference" from "PartnerApplication" where "tenantId"='${seed.tenantId}' and email='${email}'`)).toBe(reference);
    await page.close();
  });

  test("a refused challenge (bad token) shows one generic message, records nothing, and a fresh challenge succeeds", async () => {
    const email = unique("refused");
    const page = await open("/apply", ["bad"]);
    await fillApplication(page, email);
    await submitApplication(page);
    await expect(page.locator('form p[role="alert"]')).toHaveText(REFUSED);
    await expect(page.locator('form p[role="alert"]')).not.toContainText(/turnstile|captcha|bot|sicherheit/i);
    expect(applicationCount(email)).toBe(0);
    await expect(page.getByLabel("E-Mail-Adresse")).toHaveValue(email);
    await submitApplication(page); // second widget render is "ok"
    await page.getByTestId("application-reference").waitFor();
    expect(applicationCount(email)).toBe(1);
    await page.close();
  });

  for (const [mode, label] of [
    ["wrongaction", "a token minted for another action"],
    ["wronghost", "a token for a hostname that is not allowed"],
  ] as const) {
    test(`${label} is refused with the same generic message and records nothing`, async () => {
      const email = unique(mode);
      const page = await open("/apply", [mode]);
      await fillApplication(page, email);
      await submitApplication(page);
      await expect(page.locator('form p[role="alert"]')).toHaveText(REFUSED);
      expect(applicationCount(email)).toBe(0);
      await page.close();
    });
  }

  test("validation: no consent means no request; a malformed body is a 400 and records nothing", async ({ baseURL }) => {
    const page = await open("/apply");
    let posts = 0;
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().endsWith("/api/applications/direct")) posts++;
    });
    await page.getByLabel("Vor- und Nachname").fill("Erika Muster");
    await page.getByLabel("E-Mail-Adresse").fill(unique("noconsent"));
    await page.getByLabel("Telefon").fill("+49 170 0000000");
    await page.selectOption("#partnerType", "PRIVATE_REFERRER");
    await submitApplication(page); // consent box not ticked: the browser blocks the submit
    expect(posts).toBe(0);
    await page.close();

    const before = footprint();
    const bad = await context.request.post(`${baseURL}/api/applications/direct`, {
      headers: sameOrigin(baseURL!),
      data: {
        name: "E",
        email: "not-an-email",
        phone: "1",
        partnerType: "ADMIN",
        consentToApply: false,
        idempotencyKey: "nope",
        turnstileToken: "x",
        consentPolicyVersion: seed.consentPolicyVersion,
        isAdmin: true,
      },
    });
    expect(bad.status()).toBe(400);
    expect(await bad.json()).toEqual({ status: "INVALID_REQUEST" });
    expect(footprint()).toEqual(before);
  });

  test("a consent version the form did not display is refused before SalesChain is called", async ({ baseURL }) => {
    const before = footprint();
    const response = await context.request.post(`${baseURL}/api/applications/direct`, {
      headers: sameOrigin(baseURL!),
      data: {
        name: "Erika Muster",
        email: unique("otherversion"),
        phone: "+49 170 0000000",
        partnerType: "PRIVATE_REFERRER",
        consentToApply: true,
        idempotencyKey: "30000000-0000-4000-8000-000000000003",
        turnstileToken: "ok|partner-application-direct|affiliate.fertig-haus.net",
        consentPolicyVersion: "some-other-version",
      },
    });
    expect(response.status()).toBe(404);
    expect(footprint()).toEqual(before);
  });
});

test.describe("partner application, referred (a partner's recruitment link or QR)", () => {
  const url = `/apply/${seed.recruitment.code}?qr=${seed.recruitment.qr}&v=${seed.recruitment.version}`;

  test("records the sponsor and the scanned QR on the application; no lead, no customer attribution", async () => {
    const email = unique("referred");
    const before = footprint();
    const page = await open(url);
    await expect(page.getByRole("form", { name: "Partnerbewerbung" })).toBeVisible();
    expect(await widgetActions(page)).toEqual(["partner-application-referred"]);
    // the visitor is never told who invited them
    await expect(page.locator("body")).not.toContainText(/Sponsor|eingeladen von|Partner-?ID/i);
    await fillApplication(page, email);
    await submitApplication(page);
    await page.getByTestId("application-reference").waitFor();

    expect(applicationRow(email)).toBe(
      `REFERRED|${seed.partnerId}|t|PUBLIC_PARTNER_RECRUITMENT|PENDING|${seed.consentPolicyVersion}|PRIVATE_REFERRER|Bayern`,
    );
    const session = sql(
      `select "sourceChannel", "landingPagePath", "qrAssetId" is not null from "AttributionSession" where "tenantId"='${seed.tenantId}' and "referralProfileId"='${seed.recruitment.profileId}' order by "createdAt" desc limit 1`,
    );
    expect(session).toBe(`QR|/apply/${seed.recruitment.code}|t`);
    const after = footprint();
    expect(after.applications).toBe(before.applications + 1);
    expect(after.leads).toBe(before.leads);
    expect(after.consentEvidence).toBe(before.consentEvidence);
    expect(after.commissions).toBe(before.commissions);
    expect(leadCount(email)).toBe(0);
    await page.close();
  });

  test("a link without a QR is a plain referral-link application", async () => {
    const email = unique("linkonly");
    const page = await open(`/apply/${seed.recruitment.code}`);
    await fillApplication(page, email);
    await submitApplication(page);
    await page.getByTestId("application-reference").waitFor();
    expect(applicationRow(email)).toBe(
      `REFERRED|${seed.partnerId}|f|PUBLIC_PARTNER_RECRUITMENT|PENDING|${seed.consentPolicyVersion}|PRIVATE_REFERRER|Bayern`,
    );
    await page.close();
  });
});

test.describe("customer referral (a partner's personal link or QR)", () => {
  const url = `/r/${seed.customerReferral.code}?qr=${seed.customerReferral.qr}&v=${seed.customerReferral.version}&utm_source=newsletter&utm_medium=email`;

  async function register(page: Page, email: string) {
    await page.getByLabel("Vorname").fill("Erika");
    await page.getByLabel("Nachname").fill("Muster");
    await page.getByLabel("E-Mail-Adresse").fill(email);
    await page.selectOption("#productCode", seed.product.code);
    await page.getByLabel(/E2E fixture checkbox: customer referral/).check();
    await page.getByRole("button", { name: "Anfrage absenden" }).click();
  }

  test("creates a lead credited to the partner (QR, campaign values, consent evidence) and no application", async () => {
    const email = unique("customer");
    const before = footprint();
    const page = await open(url);
    await expect(page.getByRole("form", { name: "Interesse anmelden" })).toBeVisible();
    await expect(page.getByRole("option", { name: seed.product.name })).toBeAttached();
    expect(await widgetActions(page)).toEqual(["customer-referral-lead"]);
    await expect(page.locator("main")).not.toContainText(/Empfohlen von|empfohlen durch|Partner-?ID/i);
    await register(page, email);
    await expect(page.getByText(/Ihre Anfrage ist eingegangen/)).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/LEAD-|Referenz/);

    expect(
      sql(
        `select coalesce("firstReferrerPartnerId"::text,''), "sourceType", "sourceChannel", "utmSource", "utmMedium", "consentNoticeVersion", "landingPagePath" from "Lead" where "tenantId"='${seed.tenantId}' and email='${email}'`,
      ),
    ).toBe(`${seed.partnerId}|QR_REFERRAL|QR|newsletter|email|${seed.consentPolicyVersion}|/r/${seed.customerReferral.code}`);
    expect(
      sql(
        `select count(*) from "ConsentEvidence" c join "Lead" l on l.id=c."leadId" where l."tenantId"='${seed.tenantId}' and l.email='${email}' and c.consented and c."policyVersion"='${seed.consentPolicyVersion}' and c.source='PUBLIC_REFERRAL'`,
      ),
    ).toBe("1");
    const after = footprint();
    expect(after.leads).toBe(before.leads + 1);
    expect(after.applications).toBe(before.applications);
    expect(after.commissions).toBe(before.commissions); // a referral never creates a commission
    await page.close();
  });

  test("a second registration of the same contact looks identical and creates no second lead", async () => {
    const email = unique("repeat");
    const first = await open(url);
    await register(first, email);
    await expect(first.getByText(/Ihre Anfrage ist eingegangen/)).toBeVisible();
    const firstText = await first.locator("main").innerText();
    await first.close();

    const second = await open(url);
    await register(second, email);
    await expect(second.getByText(/Ihre Anfrage ist eingegangen/)).toBeVisible();
    expect(await second.locator("main").innerText()).toBe(firstText);
    expect(leadCount(email)).toBe(1);
    await second.close();
  });

  test("a refused challenge shows the generic message and creates no lead", async () => {
    const email = unique("custrefused");
    const page = await open(url, ["bad"]);
    await register(page, email);
    await expect(page.locator('form p[role="alert"]')).toHaveText(REFUSED);
    expect(leadCount(email)).toBe(0);
    await page.close();
  });
});

test.describe("the two journeys stay apart, and bad links stay generic", () => {
  const INVALID = "Dieser Link ist ungültig oder nicht mehr verfügbar.";

  test("a recruitment code never works as a customer referral and vice versa", async () => {
    const before = footprint();
    const asCustomer = await open(`/r/${seed.recruitment.code}`);
    await expect(asCustomer.getByText(INVALID)).toBeVisible();
    await asCustomer.close();
    const asRecruit = await open(`/apply/${seed.customerReferral.code}`);
    await expect(asRecruit.getByText(INVALID)).toBeVisible();
    await asRecruit.close();
    expect(footprint().leads).toBe(before.leads);
    expect(footprint().applications).toBe(before.applications);
  });

  test("an unknown code, a wrong QR version and a half-present QR pair all look the same", async () => {
    for (const path of [
      "/r/FH-0000000000000000000000000000",
      `/r/${seed.customerReferral.code}?qr=${seed.customerReferral.qr}&v=2`,
      `/r/${seed.customerReferral.code}?qr=${seed.customerReferral.qr}`,
      `/apply/${seed.recruitment.code}?qr=not-a-real-qr-id&v=1`,
      "/apply/short",
    ]) {
      const page = await open(path);
      await expect(page.getByText(INVALID), path).toBeVisible();
      await page.close();
    }
  });

  test("a revoked asset stops working at once", async () => {
    sql(`update "ReferralProfile" set active=false where id='${seed.customerReferral.profileId}'`);
    try {
      const page = await open(`/r/${seed.customerReferral.code}`);
      await expect(page.getByText(INVALID)).toBeVisible();
      await page.close();
    } finally {
      sql(`update "ReferralProfile" set active=true where id='${seed.customerReferral.profileId}'`);
    }
    const again = await open(`/r/${seed.customerReferral.code}`);
    await expect(again.getByRole("form", { name: "Interesse anmelden" })).toBeVisible();
    await again.close();
  });
});

test.describe("what the browser can see", () => {
  test("no upstream address, secret or internal id reaches the page or the BFF answers", async ({ baseURL }) => {
    const page = await open(`/r/${seed.customerReferral.code}?qr=${seed.customerReferral.qr}&v=1`);
    await expect(page.getByRole("form")).toBeVisible();
    const html = await page.content();
    for (const secret of ["4461", "SALESCHAIN_API_BASE_URL", "e2e-site-access", "e2e-turnstile-standin-secret", seed.tenantId, seed.partnerId, seed.programmeId]) {
      expect(html).not.toContain(secret);
    }
    await page.close();

    const answer = await context.request.post(`${baseURL}/api/referrals/${seed.customerReferral.code}/context`, {
      headers: sameOrigin(baseURL!),
      data: { qr: seed.customerReferral.qr, v: String(seed.customerReferral.version) },
    });
    expect(answer.status()).toBe(200);
    expect(answer.headers()["cache-control"]).toBe("private, no-store");
    expect(answer.headers()["x-robots-tag"]).toContain("noindex");
    const text = await answer.text();
    for (const leak of [seed.tenantId, seed.partnerId, seed.programmeId, seed.customerReferral.profileId, "fertig-haus-affiliate-system", "notice"]) {
      expect(text).not.toContain(leak);
    }
  });
});

test.describe("rate limiting", () => {
  test("a burst of submissions is answered with a fixed 429, never a stack or a limiter detail (runs last)", async ({ baseURL }) => {
    let limited = false;
    for (let attempt = 0; attempt < 15 && !limited; attempt++) {
      const response = await context.request.post(`${baseURL}/api/applications/direct`, {
        headers: sameOrigin(baseURL!),
        data: {
          name: "Burst Test",
          email: unique(`burst${attempt}`),
          phone: "+49 170 0000000",
          partnerType: "PRIVATE_REFERRER",
          consentToApply: true,
          idempotencyKey: `40000000-0000-4000-8000-0000000000${String(attempt).padStart(2, "0")}`,
          turnstileToken: "bad-token",
          consentPolicyVersion: seed.consentPolicyVersion,
        },
      });
      if (response.status() === 429) {
        limited = true;
        expect(await response.json()).toEqual({ status: "RATE_LIMITED" });
      } else {
        expect(response.status()).toBe(404);
      }
    }
    expect(limited).toBe(true);
  });
});
