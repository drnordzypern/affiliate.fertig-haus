import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";
import { footprint, HOSTED, HOSTED_API_HEADERS, installTurnstile, protectContext, SALESCHAIN_API, seed, sql, TURNSTILE_HOSTNAME, unique, unlock } from "./support/harness";

// The whole journey, once, in order, against the REAL local SalesChain API and database:
//   1. a visitor applies on /apply (fixture wording, Turnstile stand-in)          -> one PENDING application
//   2. a Business Admin decides it through the SalesChain API with a real session -> Partner + link + QR
//   3. the admin issues the one-time invitation; the partner accepts on /einladung -> partner session, /portal
//      showing the partner's OWN customer and recruitment links with downloadable QR codes
//   4. a customer opens the partner's link from its QR and sends an enquiry        -> one Lead credited to that partner
//   5. the Business Admin sees the attributed lead in the CRM lead list
//   6. the admin assigns it to a Sales user; before that, the Sales user cannot see it
//   7. the Sales user (email-code session) follows up: activity, next action, appointment, stage CONTACTED
//   8. Sales stays restricted: no application decision, no partner assets
//   9. retention without a worker: the Business Admin enables the approved 12 / 6 / 6 policy, previews and runs one
//      manual job; only the due synthetic records are anonymized, the live journey lead is untouched
// Commissions stay off throughout: no plan, no entry. Nothing is approved automatically.
test.describe.configure({ mode: "serial" });

const api = (path: string) => `${SALESCHAIN_API}/v1/programmes/${seed.programmeId}${path}`;
const asAdmin = { authorization: `Bearer ${seed.businessAdmin.token}` };
const asSales = { authorization: `Bearer ${seed.sales.token}` };
type CrmLead = {
  id: string;
  version: number;
  stage: string;
  referralProfile?: { referralCode: string } | null;
  qrAsset?: { publicId: string } | null;
};

let context: BrowserContext;
let admin: APIRequestContext;
const applicant = unique("journey-partner");
const customer = unique("journey-customer");
let reference = "";
let applicationId = "";
let partnerId = "";
let customerLink = { code: "", url: "", qr: "", version: 0 };
let recruitmentUrl = "";
let portalQrUrl = "";
let leadId = "";
const commissionsAtStart = () => footprint().commissions;
let commissions = 0;

test.beforeAll(async ({ browser, playwright, baseURL }) => {
  context = await browser.newContext();
  await protectContext(context, baseURL!);
  await unlock(context, baseURL!);
  admin = await playwright.request.newContext({ extraHTTPHeaders: HOSTED_API_HEADERS });
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
  expect(customerProfile.canonicalUrl).toBe(`https://${TURNSTILE_HOSTNAME}/r/${customerProfile.referralCode}`);
  expect(recruitmentProfile.canonicalUrl).toBe(`https://${TURNSTILE_HOSTNAME}/apply/${recruitmentProfile.referralCode}`);
  expect(customerProfile.availableForPublicIntake).toBe(true);
  const qr = customerProfile.qrAssets.find((asset) => asset.active)!;
  customerLink = { code: customerProfile.referralCode, url: customerProfile.canonicalUrl!, qr: qr.publicId, version: qr.version };
  recruitmentUrl = recruitmentProfile.canonicalUrl!;
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

  // The portal shows the partner's OWN links (exactly the ones the admin sees) with a QR code and download each.
  await expect(page.getByRole("textbox", { name: "Empfehlungslink" })).toHaveValue(customerLink.url);
  await expect(page.getByRole("textbox", { name: "Bewerbungslink" })).toHaveValue(recruitmentUrl);
  const qrImage = page.getByAltText("QR-Code Ihres Empfehlungslinks");
  await expect(qrImage).toBeVisible();
  expect(await qrImage.getAttribute("src")).toMatch(/^data:image\/png;base64,/);
  const download = page.getByRole("link", { name: "QR-Code herunterladen" }).first();
  expect(await download.getAttribute("download")).toBe("fertig-haus-empfehlungslink-qr.png");
  expect(await download.getAttribute("href")).toBe(await qrImage.getAttribute("src"));
  await expect(page.locator("body")).not.toContainText(partnerId);
  await page.close();

  // What the QR encodes, read with the partner's own session (the HttpOnly cookie the BFF set): the link plus the
  // active QR asset, exactly as the admin's asset screen shows it.
  const cookie = (await context.cookies()).find((item) => item.name === "partner_session");
  expect(cookie?.httpOnly).toBe(true);
  const own = await admin.get(`${SALESCHAIN_API}/v1/partner-sessions/me/referral-links`, {
    headers: { authorization: `Bearer ${cookie!.value}` },
  });
  expect(own.status()).toBe(200);
  const links = ((await own.json()) as { links: Array<{ purpose: string; url: string; qrUrl: string | null }> }).links;
  const customerOwn = links.find((link) => link.purpose === "CUSTOMER_REFERRAL")!;
  expect(customerOwn.url).toBe(customerLink.url);
  expect(customerOwn.qrUrl).toBe(`${customerLink.url}?qr=${customerLink.qr}&v=${customerLink.version}`);
  // on a test host nothing may point to the production site: every link and QR address the partner can see stays on the test host
  if (process.env.E2E_PUBLIC_HOST) {
    for (const link of links) {
      expect(link.url).not.toContain("affiliate.fertig-haus.net");
      expect(link.qrUrl ?? "").not.toContain("affiliate.fertig-haus.net");
    }
  }
  portalQrUrl = customerOwn.qrUrl!;
  // the seeded partner's link is someone else's: never listed for this partner
  expect(links.map((link) => link.url)).not.toContain(`https://${TURNSTILE_HOSTNAME}/r/${seed.customerReferral.code}`);
  expect((await admin.get(`${SALESCHAIN_API}/v1/partner-sessions/me/referral-links`)).status(), "no session, no links").toBe(401);
  expect(
    sql(`select count(*) from "PartnerSession" s join "Partner" p on p.id=s."partnerId" where p.id='${partnerId}' and s."revokedAt" is null`),
  ).toBe("1");
});

test("4. a customer scans the partner's QR and sends an enquiry: one Lead credited to the new partner", async () => {
  const before = footprint();
  // exactly what the downloaded QR code opens, on the local host
  const scanned = new URL(portalQrUrl);
  const page = await open(`${scanned.pathname}${scanned.search}`);
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
  const rows = (await leads.json()) as CrmLead[];
  const lead = rows.find((row) => row.referralProfile?.referralCode === customerLink.code);
  expect(lead, "the enquiry is in the CRM lead list").toBeTruthy();
  expect(lead!.qrAsset?.publicId).toBe(customerLink.qr);
  expect(lead!.stage).toBe("NEW_LEAD");
  leadId = lead!.id;
  expect(sql(`select count(*) from "CommissionEntry" where "tenantId"='${seed.tenantId}' and "partnerId"='${partnerId}'`)).toBe("0");
});

async function crmLead(headers: Record<string, string>): Promise<CrmLead | undefined> {
  const response = await admin.get(api("/affiliate/crm/leads"), { headers });
  expect(response.status()).toBe(200);
  return ((await response.json()) as CrmLead[]).find((row) => row.id === leadId);
}

test("6. the admin assigns the lead to Sales; until then the Sales user cannot see it", async () => {
  expect(await crmLead(asSales), "an unassigned lead is not in the Sales list").toBeUndefined();
  const lead = (await crmLead(asAdmin))!;
  const assigned = await admin.patch(api(`/affiliate/crm/leads/${leadId}/assignment`), {
    headers: asAdmin,
    data: { membershipId: seed.sales.membershipId, expectedVersion: lead.version },
  });
  expect(assigned.status(), await assigned.text()).toBeLessThan(300);
  expect(sql(`select "assignedMembershipId" from "Lead" where id='${leadId}'`)).toBe(seed.sales.membershipId);
  expect(await crmLead(asSales), "the assigned lead is in the Sales list").toBeTruthy();
});

test("7. the Sales user follows up: activity history, next action, appointment, stage CONTACTED", async () => {
  const day = 24 * 60 * 60 * 1000;
  const activity = await admin.post(api(`/crm-pilot/leads/${leadId}/activities`), {
    headers: asSales,
    data: {
      type: "CONTACT_COMPLETED",
      channel: "PHONE",
      outcome: "CONNECTED",
      occurredAt: new Date().toISOString(),
      safeNote: "TEST journey first call",
      requestId: randomUUID(),
    },
  });
  expect(activity.status(), await activity.text()).toBeLessThan(300);

  const nextAction = await admin.post(api(`/crm-pilot/leads/${leadId}/next-actions`), {
    headers: asSales,
    data: {
      type: "CONSULTATION",
      dueAt: new Date(Date.now() + 2 * day).toISOString(),
      responsibleMembershipId: seed.sales.membershipId,
      safeNote: "TEST journey prepare consultation",
      requestId: randomUUID(),
    },
  });
  expect(nextAction.status(), await nextAction.text()).toBeLessThan(300);

  const start = new Date(Date.now() + 3 * day);
  start.setUTCHours(9, 0, 0, 0);
  const appointment = await admin.post(api(`/crm-pilot/leads/${leadId}/appointments`), {
    headers: asSales,
    data: {
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + 60 * 60 * 1000).toISOString(),
      responsibleMembershipId: seed.sales.membershipId,
      safeNote: "TEST journey consultation",
      requestId: randomUUID(),
    },
  });
  expect(appointment.status(), await appointment.text()).toBeLessThan(300);

  const current = (await crmLead(asSales))!;
  const staged = await admin.patch(api(`/affiliate/crm/leads/${leadId}/stage`), {
    headers: asSales,
    data: { stage: "CONTACTED", reason: "TEST journey first call completed", expectedVersion: current.version },
  });
  expect(staged.status(), await staged.text()).toBeLessThan(300);

  expect(sql(`select stage from "Lead" where id='${leadId}'`)).toBe("CONTACTED");
  expect(sql(`select count(*) from "LeadActivity" where "leadId"='${leadId}'`)).toBe("1");
  expect(sql(`select count(*) from "LeadNextAction" where "leadId"='${leadId}'`)).toBe("1");
  expect(sql(`select count(*) from "LeadAppointment" where "leadId"='${leadId}'`)).toBe("1");
  expect(sql(`select count(*) from "LeadStageHistory" where "leadId"='${leadId}'`)).not.toBe("0");
  expect(sql(`select count(*) from "CommissionEntry" where "tenantId"='${seed.tenantId}' and "partnerId"='${partnerId}'`)).toBe("0");
});

test("8. Sales stays restricted: no application decisions, no partner assets", async () => {
  const decision = await admin.post(api(`/affiliate/partner-applications/${applicationId}/decision`), {
    headers: asSales,
    data: { decision: "REJECT", note: "TEST should be refused" },
  });
  expect([401, 403]).toContain(decision.status());
  const assets = await admin.get(api(`/referral-assets?partnerId=${partnerId}`), { headers: asSales });
  expect([401, 403]).toContain(assets.status());
  expect(sql(`select status from "PartnerApplication" where id='${applicationId}'`)).toBe("APPROVED");
});

test("9. retention by the Business Admin (no worker): approved 12 / 6 / 6 policy, preview, one manual run", async () => {
  test.skip(HOSTED, "the hosted test environment keeps the retention execution switch off; this step is covered by the local run");
  // Synthetic records that are due under the approved rules: an enquiry closed without a contract 14 months ago, and a
  // rejected application decided 7 months ago. Inserted directly (the past cannot be created through the API).
  const brandId = sql(`select "brandId" from "Programme" where id='${seed.programmeId}'`);
  const tag = Date.now().toString(36);
  const oldLeadEmail = `retention-lead.${tag}@example.invalid`;
  const oldApplicationEmail = `retention-application.${tag}@example.invalid`;
  sql(
    `insert into "Lead"(id,"tenantId","brandId","programmeId","publicReference","firstName","lastName",email,phone,"normalizedEmailHash","normalizedPhoneHash","emailDeduplicationKey","phoneDeduplicationKey","sourceType",stage,"createdAt","updatedAt") values (gen_random_uuid(),'${seed.tenantId}','${brandId}','${seed.programmeId}','LEAD-RET-${tag}','TEST','Retention','${oldLeadEmail}','+4915100009999',encode(sha256(convert_to('e${tag}','UTF8')),'hex'),encode(sha256(convert_to('p${tag}','UTF8')),'hex'),encode(sha256(convert_to('ek${tag}','UTF8')),'hex'),encode(sha256(convert_to('pk${tag}','UTF8')),'hex'),'WEBSITE_FORM','LOST',now()-interval '14 months',now()-interval '14 months')`,
  );
  sql(
    `insert into "PartnerApplication"(id,"tenantId","programmeId","publicReference",name,email,"normalizedEmailHash",phone,"normalizedPhoneHash","partnerType","consentedAt","consentPolicyVersion",source,status,"reviewedAt","createdAt","updatedAt") values (gen_random_uuid(),'${seed.tenantId}','${seed.programmeId}','APP-RET-${tag}','TEST Retention Applicant','${oldApplicationEmail}',encode(sha256(convert_to('ae${tag}','UTF8')),'hex'),'+4917000009999',encode(sha256(convert_to('ap${tag}','UTF8')),'hex'),'PRIVATE_REFERRER',now()-interval '8 months','${seed.consentPolicyVersion}','UPGRADE_FIXTURE','REJECTED',now()-interval '7 months',now()-interval '8 months',now()-interval '7 months')`,
  );

  const privacy = (path: string) => api(`/crm-privacy${path}`);
  // Sales may not operate retention.
  const salesRun = await admin.post(privacy("/retention-jobs"), { headers: asSales, data: { dryRun: false } });
  expect([401, 403]).toContain(salesRun.status());

  const saved = await admin.post(privacy("/retention-policy"), {
    headers: asAdmin,
    data: { requestId: randomUUID(), retentionMonths: 12, applicationRetentionMonths: 6, partnerReviewMonths: 6, enabled: true },
  });
  expect(saved.status(), await saved.text()).toBeLessThan(300);

  const preview = await admin.get(privacy("/retention-preview"), { headers: asAdmin });
  expect(preview.status(), await preview.text()).toBe(200);
  const counts = (await preview.json()) as { candidateCount: number; applications?: { candidateCount: number } };
  expect(counts.candidateCount).toBeGreaterThanOrEqual(1);
  expect(counts.applications?.candidateCount ?? 0).toBeGreaterThanOrEqual(1);
  expect(sql(`select count(*) from "Lead" where email='${oldLeadEmail}' and "anonymizedAt" is null`), "a preview changes nothing").toBe("1");

  const run = await admin.post(privacy("/retention-jobs"), { headers: asAdmin, data: { dryRun: false } });
  expect(run.status(), await run.text()).toBeLessThan(300);

  expect(sql(`select count(*) from "Lead" where email='${oldLeadEmail}'`), "the old enquiry no longer holds its e-mail").toBe("0");
  expect(sql(`select count(*) from "Lead" where "publicReference"='LEAD-RET-${tag}' and "anonymizedAt" is not null`)).toBe("1");
  expect(sql(`select count(*) from "PartnerApplication" where "publicReference"='APP-RET-${tag}' and "anonymizedAt" is not null`)).toBe("1");
  expect(sql(`select count(*) from "PartnerApplication" where "publicReference"='APP-RET-${tag}' and email='${oldApplicationEmail}'`)).toBe("0");
  // the live journey records are untouched
  expect(sql(`select count(*) from "Lead" where id='${leadId}' and "anonymizedAt" is null and email='${customer}'`)).toBe("1");
  expect(sql(`select count(*) from "PartnerApplication" where id='${applicationId}' and "anonymizedAt" is null`)).toBe("1");
  expect(sql(`select count(*) from "CommissionEntry" where "tenantId"='${seed.tenantId}'`)).toBe(String(commissions));

  // leave the policy disabled again, as in production until the owner enables it
  const disabled = await admin.post(privacy("/retention-policy"), {
    headers: asAdmin,
    data: { requestId: randomUUID(), retentionMonths: 12, applicationRetentionMonths: 6, partnerReviewMonths: 6, enabled: false },
  });
  expect(disabled.status()).toBeLessThan(300);
});

