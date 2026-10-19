import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, configure, render, screen, waitFor } from "@testing-library/react";
import ApplyPage from "@/app/apply/page";
import ReferredApplyPage from "@/app/apply/[code]/page";
import ReferralPage from "@/app/r/[code]/page";

vi.mock("next/script", () => ({ default: () => null }));

// The whole suite runs in parallel; keep async queries patient so load never causes a false failure.
configure({ asyncUtilTimeout: 5_000 });

const CODE = "FH-recruit_referral-code";
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ status: "UNAVAILABLE" }) });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("with the gates unset the three pages render one heading each and an honest notice, with no request", async () => {
  render(await ApplyPage({ searchParams: Promise.resolve({}) }));
  expect(screen.getByRole("heading", { level: 1, name: "Bewerbung als Partner" })).toBeTruthy();
  cleanup();
  render(await ReferredApplyPage({ params: Promise.resolve({ code: CODE }), searchParams: Promise.resolve({}) }));
  expect(screen.getByRole("heading", { level: 1, name: "Bewerbung auf Einladung" })).toBeTruthy();
  cleanup();
  render(await ReferralPage({ params: Promise.resolve({ code: CODE }), searchParams: Promise.resolve({}) }));
  expect(screen.getByRole("heading", { level: 1, name: "Interesse anmelden" })).toBeTruthy();
  expect(screen.getByText("Diese Seite ist derzeit nicht verfügbar.")).toBeTruthy();
  expect(fetchMock).not.toHaveBeenCalled();
});

test("the two journeys are separate pages with separate gates", async () => {
  vi.stubEnv("AFFILIATE_PARTNER_APPLICATIONS_ENABLED", "true");
  render(await ReferralPage({ params: Promise.resolve({ code: CODE }), searchParams: Promise.resolve({}) }));
  expect(screen.getByText("Diese Seite ist derzeit nicht verfügbar.")).toBeTruthy();
  expect(fetchMock).not.toHaveBeenCalled();
  cleanup();
  vi.unstubAllEnvs();
  vi.stubEnv("AFFILIATE_CUSTOMER_REFERRALS_ENABLED", "true");
  render(await ReferredApplyPage({ params: Promise.resolve({ code: CODE }), searchParams: Promise.resolve({}) }));
  expect(screen.getByText("Diese Seite ist derzeit nicht verfügbar.")).toBeTruthy();
  expect(fetchMock).not.toHaveBeenCalled();
});

test("an open gate hands the landing QR pair to the application context request, server-read, first value only", async () => {
  vi.stubEnv("AFFILIATE_PARTNER_APPLICATIONS_ENABLED", "true");
  render(
    await ReferredApplyPage({
      params: Promise.resolve({ code: CODE }),
      searchParams: Promise.resolve({ qr: ["fhqr_public_asset", "second"], v: "2", utm_source: "ignored-here" }),
    }),
  );
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  expect(fetchMock.mock.calls[0]![0]).toBe(`/api/applications/referred/${CODE}/context`);
  expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ qr: "fhqr_public_asset", v: "2" });
});

test("an open customer gate also passes the plain campaign values", async () => {
  vi.stubEnv("AFFILIATE_CUSTOMER_REFERRALS_ENABLED", "true");
  render(
    await ReferralPage({
      params: Promise.resolve({ code: CODE }),
      searchParams: Promise.resolve({ qr: "fhqr_public_asset", v: "1", utm_source: "newsletter", utm_medium: "email" }),
    }),
  );
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({
    qr: "fhqr_public_asset",
    v: "1",
    utmSource: "newsletter",
    utmMedium: "email",
  });
});
