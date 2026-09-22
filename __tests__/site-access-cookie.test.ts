// @vitest-environment node
import { expect, test } from "vitest";
import { createHmac } from "node:crypto";
import {
  createSiteAccessCookieValue,
  SITE_ACCESS_MAX_AGE_SECONDS,
  verifySiteAccessCookieValue,
} from "@/lib/site-access/cookie";

const SECRET = "a".repeat(32);
const OTHER_SECRET = "b".repeat(32);

test("a freshly created cookie value verifies successfully", () => {
  const value = createSiteAccessCookieValue(SECRET);
  expect(verifySiteAccessCookieValue(value, SECRET)).toBe(true);
});

test("the cookie payload contains no password, token, or identity data", () => {
  const value = createSiteAccessCookieValue(SECRET);
  const [encodedPayload] = value.split(".");
  const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  expect(Object.keys(payload).sort()).toEqual(["exp", "v"]);
  expect(JSON.stringify(payload)).not.toMatch(/password|partner|email|token|session/i);
});

test("the lifetime is exactly four hours", () => {
  expect(SITE_ACCESS_MAX_AGE_SECONDS).toBe(4 * 60 * 60);
});

test("rejects a cookie signed with a different secret (forged/tampered)", () => {
  const value = createSiteAccessCookieValue(SECRET);
  expect(verifySiteAccessCookieValue(value, OTHER_SECRET)).toBe(false);
});

test("rejects a value with the signature altered", () => {
  const value = createSiteAccessCookieValue(SECRET);
  const [payload, signature] = value.split(".");
  const tamperedSignature = signature.slice(0, -1) + (signature.at(-1) === "A" ? "B" : "A");
  expect(verifySiteAccessCookieValue(`${payload}.${tamperedSignature}`, SECRET)).toBe(false);
});

test("rejects a value with the payload altered but the original signature kept", () => {
  const value = createSiteAccessCookieValue(SECRET);
  const [, signature] = value.split(".");
  const forgedPayload = Buffer.from(JSON.stringify({ v: 1, exp: Date.now() + 999_999_999 }), "utf8").toString(
    "base64url"
  );
  expect(verifySiteAccessCookieValue(`${forgedPayload}.${signature}`, SECRET)).toBe(false);
});

test("rejects an expired cookie", () => {
  const now = Date.now();
  const value = createSiteAccessCookieValue(SECRET, now - SITE_ACCESS_MAX_AGE_SECONDS * 1000 - 1);
  expect(verifySiteAccessCookieValue(value, SECRET, now)).toBe(false);
});

test("rejects a malformed value (no separator)", () => {
  expect(verifySiteAccessCookieValue("not-a-valid-cookie-value", SECRET)).toBe(false);
});

test("rejects an empty or missing value", () => {
  expect(verifySiteAccessCookieValue("", SECRET)).toBe(false);
  expect(verifySiteAccessCookieValue(undefined, SECRET)).toBe(false);
});

test("rejects a payload with an unexpected schema version", () => {
  const forgedPayload = Buffer.from(JSON.stringify({ v: 2, exp: Date.now() + 100_000 }), "utf8").toString(
    "base64url"
  );
  // Sign it correctly (simulating a future/older version, not just noise).
  const signature = createHmac("sha256", SECRET).update(forgedPayload).digest("base64url");
  expect(verifySiteAccessCookieValue(`${forgedPayload}.${signature}`, SECRET)).toBe(false);
});

test("rejects a payload with extra fields", () => {
  const forgedPayload = Buffer.from(
    JSON.stringify({ v: 1, exp: Date.now() + 100_000, partnerId: "x" }),
    "utf8"
  ).toString("base64url");
  const signature = createHmac("sha256", SECRET).update(forgedPayload).digest("base64url");
  expect(verifySiteAccessCookieValue(`${forgedPayload}.${signature}`, SECRET)).toBe(false);
});
