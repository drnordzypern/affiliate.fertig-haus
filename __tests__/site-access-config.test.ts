// @vitest-environment node
import { afterEach, expect, test, vi } from "vitest";
import { getSiteAccessConfig } from "@/lib/site-access/config";

afterEach(() => {
  vi.unstubAllEnvs();
});

test("returns null when both variables are missing", () => {
  vi.stubEnv("AFFILIATE_SITE_ACCESS_PASSWORD", "");
  vi.stubEnv("AFFILIATE_SITE_ACCESS_SECRET", "");
  expect(getSiteAccessConfig()).toBeNull();
});

test("returns null when the password is present but too short", () => {
  vi.stubEnv("AFFILIATE_SITE_ACCESS_PASSWORD", "short");
  vi.stubEnv("AFFILIATE_SITE_ACCESS_SECRET", "a".repeat(32));
  expect(getSiteAccessConfig()).toBeNull();
});

test("returns null when the secret is present but too short", () => {
  vi.stubEnv("AFFILIATE_SITE_ACCESS_PASSWORD", "a-fine-password");
  vi.stubEnv("AFFILIATE_SITE_ACCESS_SECRET", "too-short");
  expect(getSiteAccessConfig()).toBeNull();
});

test("returns null when the password exceeds the maximum length", () => {
  vi.stubEnv("AFFILIATE_SITE_ACCESS_PASSWORD", "a".repeat(600));
  vi.stubEnv("AFFILIATE_SITE_ACCESS_SECRET", "a".repeat(32));
  expect(getSiteAccessConfig()).toBeNull();
});

test("returns the config when both variables are present and long enough", () => {
  vi.stubEnv("AFFILIATE_SITE_ACCESS_PASSWORD", "a-fine-password");
  vi.stubEnv("AFFILIATE_SITE_ACCESS_SECRET", "a".repeat(32));
  expect(getSiteAccessConfig()).toEqual({
    password: "a-fine-password",
    secret: "a".repeat(32),
  });
});
