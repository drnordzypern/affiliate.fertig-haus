// @vitest-environment node
import { expect, test } from "vitest";
import { verifyPassword } from "@/lib/site-access/password";

test("returns true for a matching password", () => {
  expect(verifyPassword("correct-password", "correct-password")).toBe(true);
});

test("returns false for a non-matching password", () => {
  expect(verifyPassword("wrong-password", "correct-password")).toBe(false);
});

test("returns false for differing lengths without throwing", () => {
  expect(verifyPassword("short", "a-much-longer-correct-password")).toBe(false);
});

test("is case-sensitive", () => {
  expect(verifyPassword("Correct-Password", "correct-password")).toBe(false);
});
