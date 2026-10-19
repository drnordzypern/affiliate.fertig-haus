// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { customerReferralsEnabled, partnerApplicationsEnabled } from "@/lib/public-journeys/config";
import { approvedConsentText, approvedConsentTexts } from "@/lib/public-journeys/consent";

afterEach(() => vi.unstubAllEnvs());

describe("feature gates", () => {
  test("both default closed", () => {
    expect(partnerApplicationsEnabled()).toBe(false);
    expect(customerReferralsEnabled()).toBe(false);
  });

  test.each(["", "false", "TRUE", "True", "1", "yes", " true", "true "])("%j does not open a gate", (value) => {
    vi.stubEnv("AFFILIATE_PARTNER_APPLICATIONS_ENABLED", value);
    vi.stubEnv("AFFILIATE_CUSTOMER_REFERRALS_ENABLED", value);
    expect(partnerApplicationsEnabled()).toBe(false);
    expect(customerReferralsEnabled()).toBe(false);
  });

  test("only the exact string true opens a gate, and each gate is independent", () => {
    vi.stubEnv("AFFILIATE_PARTNER_APPLICATIONS_ENABLED", "true");
    expect(partnerApplicationsEnabled()).toBe(true);
    expect(customerReferralsEnabled()).toBe(false);
    vi.stubEnv("AFFILIATE_PARTNER_APPLICATIONS_ENABLED", "");
    vi.stubEnv("AFFILIATE_CUSTOMER_REFERRALS_ENABLED", "true");
    expect(partnerApplicationsEnabled()).toBe(false);
    expect(customerReferralsEnabled()).toBe(true);
  });
});

describe("consent wording registry", () => {
  test("no wording is approved: the shipped registry is empty", () => {
    expect(Object.keys(approvedConsentTexts)).toEqual([]);
    expect(approvedConsentText("partnerApplication", "any-version")).toBeNull();
    expect(approvedConsentText("customerReferral", "any-version")).toBeNull();
  });

  test("prototype keys are never mistaken for an approved version", () => {
    for (const key of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      expect(approvedConsentText("partnerApplication", key)).toBeNull();
    }
  });
});

test(".env.example declares both gates with no value (so a copied template stays closed)", () => {
  const env = readFileSync(resolve(process.cwd(), ".env.example"), "utf-8");
  for (const name of ["AFFILIATE_PARTNER_APPLICATIONS_ENABLED", "AFFILIATE_CUSTOMER_REFERRALS_ENABLED"]) {
    expect(env).toMatch(new RegExp(`^${name}=\\s*$`, "m"));
  }
});