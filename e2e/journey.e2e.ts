import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";
import { footprint, installTurnstile, SALESCHAIN_API, seed, sql, unique, unlock } from "./support/harness";

// The whole journey, once, in order, against the REAL local SalesChain API and database:
//   1. a visitor applies on /apply (fixture wording, Turnstile stand-in)          -> one PENDING application
//   2. a Business Admin decides it through the SalesChain API with a real session -> Partner + link + QR
//   3. the admin issues the one-time invitation; the partner accepts on /einladung -> partner session, /portal
//   4. a customer opens the partner's link from its QR and sends an enquiry        -> one Lead credited to that partner
//   5. the Business Admin sees the attributed lead in the CRM lead list
// Commissions stay off throughout: no plan, no entry. Nothing is approved automatically.
test.describe.configure({ mode: "serial" });

const api = (path: string) => `${SALESCHAIN_API}/v1/programmes/${seed.programmeId}${path}`;
const asAdmin = { authorization: `Bearer ${seed.businessAdmin.token}` };

let context: BrowserContext;
let admin: APIRequestContext;
const applicant = unique("journey-partner");
const customer = unique("journey-customer");
let reference = "";
let applicationId = "";
let partnerId = "";
let customerLink = { code: "", url: "", qr: "", version: 0 };
const commissionsAtStart = () => footprint().commissions;
let commissions = 0;

test.beforeAll(async ({ browser, playwright, baseURL }) => {
  context = await browser.newContext();
  await unlock(context, baseURL!);
  admin = await playwright.request.newContext();
  commissions = commissionsAtStart();
});
test.afterAll(async () => {
  await context.close();
  await admin.dispose();
});

async function open(path: string): Promise<Page> {
  const page = await context.newPage();
  await installTurnstile(page);
  await page.goto(path);
  return page;
}

test("1. the visitor applies: one application in review, no partner, no access, no link", async () => {
  const page = await open("/apply");
  await page.getByLabel("Vor- und Nachname").fill("TEST Journey Partnerin");
  await page.getByLabel("E-Mail-Adresse").fill(applicant);
  await page.getByLabel("Telefon").fill("+49 170 0000001");
  await page.selectOption("#partnerType", "PRIVATE_REFERRER");
  await page.getByLabel(/E2E fixture checkbox: partner application/).check();
  await page.getByRole("button", { name: "Bewerbung absenden" }).click();
  reference = (await page.getByTestId("application-reference").textContent()) ?? "";
  expect(reference).toMatch(/^PA-\d{4}-[A-F0-9]{10}$/);
  await page.close();

  expect(
    sql(`select status, coalesce("createdPartnerId"::text,'') from "PartnerApplication" where "tenantId"='${seed.tenantId}' and email='${applicant}'`),
  ).toBe("PENDING|");
  expect(sql(`select count(*) from "User" where email='${applicant}'`)).toBe("0");
});

test("2. the Business Admin finds and approves it: Partner, customer link and QR, recruitment link and QR", async () => {
  // Mandatory approval: without a staff session the decision is refused.
  const list = await admin.get(api("/affiliate/partner-applications"), { headers: asAdmin });
  expect(list.status()).toBe(200);
  const rows = (await list.json()) as Array<Record<string, unknown>>;
  const row = (Array.isArray(rows) ? rows : (rows as { applications?: Array<Record<string, unknown>> }).applications ?? []).find(
    (item) => item.publicReference === reference,
  );
  expect(row, "the application is listed for the Business Admin").toBeTruthy();
  applicationId = String(row!.id);

  const anonymous = await admin.post(api(`/affiliate/partner-applications/${applicationId}/decision`), {
    data: { decision: "APPROVE", note: "TEST journey approval" },
  });
  expect(anonymous.status()).toBe(401);

  const decided = await admin.post(api(`/affiliate/partner-applications/${applicationId}/decision`), {
    headers: asAdmin,
    data: { decision: "APPROVE", note: "TEST journey approval" },
  });
  expect(decided.status(), await decided.text()).toBeLessThan(300);

  partnerId = sql(`select "createdPartnerId" from "PartnerApplication" where id='${applicationId}' and status='APPROVED'`);
  expect(partnerId).toMatch(/^[0-9a-f-]{36}$/);

  const assets = await admin.get(api(`/referral-assets?partnerId=${partnerId}`), { headers: asAdmin });
  expect(assets.status()).toBe(200);
  const body = (await assets.json()) as {
    enrollment: { status: string };
    profiles: Array<{ purpose: string; referralCode: string; canonicalUrl: string | null; availableForPublicIntake: boolean; qrAssets: Array<{ publicId: string; version: number; active: boolean }> }>;
  };
  expect(body.enrollment.status).toBe("APPROVED");
  const customerProfile = body.profiles.find((profile) => profile.purpose === "CUSTOMER_REFERRAL")!;
  const recruitmentProfile = body.profiles.find((profile) => profile.purpose === "PARTNER_RECRUITMENT")!;
  expect(customerProfile.canonicalUrl).toBe(`https://affiliate.fertig-haus.net/r/${customerProfile.referralCode}`);
  expect(recruitmentProfile.canonicalUrl).toBe(`https://affiliate.fertig-haus.net/apply/${recruitmentProfile.referralCode}`);
  expect(customerProfile.availableForPublicIntake).toBe(true);
  const qr = customerProfile.qrAssets.find((asset) => asset.active)!;
  customerLink = { code: customerProfile.referralCode, url: customerProfile.canonicalUrl!, qr: qr.publicId, version: qr.version };
  expect(footprint().commissions).toBe(commissions);
});

test("3. the admin issues the invitation; the partner accepts it and reaches the portal", async () => {
  const issued = await admin.post(`${SALESCHAIN_API}/v1/partners/${partnerId}/invitation/issue?programmeId=${seed.programmeId}`, {
    headers: asAdmin,
  });
  expect(issued.status(), await issued.text()).toBeLessThan(300);
  const invitation = (await issued.json()) as { status: string; rawToken?: string };
  expect(invitation.status).toBe("ISSUED");

  // Before accepting, the portal is closed.
  const before = await open("/portal");
  await expect(before).toHaveURL(/\/einladung/);
  await before.close();

  // The administrator hands the one-time link over out of band; the token travels only in the fragment.
  const page = await open(`/einladung#token=${invitation.rawToken}`);
  await expect(page).toHaveURL(/\/portal$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Partnerportal" })).toBeVisible();
  await page.close();
  expect(
    sql(`select count(*) from "PartnerSession" s join "Partner" p on p.id=s."partnerId" where p.id='${partnerId}' and s."revokedAt" is null`),
  ).toBe("1");
});

test("4. a customer scans the partner's QR and sends an enquiry: one Lead credited to the new partner", async () => {
  const before = footprint();
  const page = await open(`/r/${customerLink.code}?qr=${customerLink.qr}&v=${customerLink.version}`);
  await expect(page.getByRole("form", { name: "Interesse anmelden" })).toBeVisible();
  await page.getByLabel("Vorname").fill("TEST Journey");
  await page.getByLabel("Nachname").fill("Kunde");
  await page.getByLabel("E-Mail-Adresse").fill(customer);
  await page.selectOption("#productCode", seed.product.code);
  await page.getByLabel(/E2E fixture checkbox: customer referral/).check();
  await page.getByRole("button", { name: "Anfrage absenden" }).click();
  await expect(page.getByText(/Ihre Anfrage ist eingegangen/)).toBeVisible();
  // the customer never sees who referred them
  await expect(page.locator("main")).not.toContainText(/Empfohlen von|empfohlen durch|Partner-?ID/i);
  await page.close();

  expect(
    sql(
      `select l."firstReferrerPartnerId", l."sourceType", l."sourceChannel", l."consentNoticeVersion", rp."referralCode" from "Lead" l join "ReferralProfile" rp on rp.id=l."referralProfileId" where l."tenantId"='${seed.tenantId}' and l.email='${customer}'`,
    ),
  ).toBe(`${partnerId}|QR_REFERRAL|QR|${seed.consentPolicyVersion}|${customerLink.code}`);
  const after = footprint();
  expect(after.leads).toBe(before.leads + 1);
  expect(after.applications).toBe(before.applications);
  expect(after.commissions).toBe(commissions);
});

test("5. the Business Admin sees the attributed lead in the CRM", async () => {
  const leads = await admin.get(api("/affiliate/crm/leads"), { headers: asAdmin });
  expect(leads.status()).toBe(200);
  const rows = (await leads.json()) as Array<{ email?: string; referralProfile?: { referralCode: string } | null; qrAsset?: { publicId: string } | null; stage?: string }>;
  const lead = rows.find((row) => row.referralProfile?.referralCode === customerLink.code);
  expect(lead, "the enquiry is in the CRM lead list").toBeTruthy();
  expect(lead!.qrAsset?.publicId).toBe(customerLink.qr);
  expect(sql(`select count(*) from "CommissionEntry" where "tenantId"='${seed.tenantId}' and "partnerId"='${partnerId}'`)).toBe("0");
});
