// @vitest-environment node
import { expect, test } from "vitest";
import { isRateLimited, recordFailedAttempt, recordSuccess } from "@/lib/site-access/rate-limit";

test("is not rate-limited before any failed attempts", () => {
  const key = `key-${Math.random()}`;
  expect(isRateLimited(key)).toBe(false);
});

test("becomes rate-limited after the maximum number of failed attempts", () => {
  const key = `key-${Math.random()}`;
  const now = Date.now();
  for (let i = 0; i < 4; i++) recordFailedAttempt(key, now);
  expect(isRateLimited(key, now)).toBe(false);
  recordFailedAttempt(key, now);
  expect(isRateLimited(key, now)).toBe(true);
});

test("resets after the window expires", () => {
  const key = `key-${Math.random()}`;
  const now = Date.now();
  for (let i = 0; i < 5; i++) recordFailedAttempt(key, now);
  expect(isRateLimited(key, now)).toBe(true);
  expect(isRateLimited(key, now + 6 * 60 * 1000)).toBe(false);
});

test("a recorded success clears the limit immediately", () => {
  const key = `key-${Math.random()}`;
  const now = Date.now();
  for (let i = 0; i < 5; i++) recordFailedAttempt(key, now);
  expect(isRateLimited(key, now)).toBe(true);
  recordSuccess(key);
  expect(isRateLimited(key, now)).toBe(false);
});

test("different keys are tracked independently", () => {
  const keyA = `key-${Math.random()}`;
  const keyB = `key-${Math.random()}`;
  const now = Date.now();
  for (let i = 0; i < 5; i++) recordFailedAttempt(keyA, now);
  expect(isRateLimited(keyA, now)).toBe(true);
  expect(isRateLimited(keyB, now)).toBe(false);
});
