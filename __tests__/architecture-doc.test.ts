import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("the architecture boundary document exists and states the key rules", () => {
  const doc = readFileSync(
    resolve(process.cwd(), "docs/architecture.md"),
    "utf-8"
  );

  expect(doc).toMatch(/source of truth/i);
  expect(doc).toMatch(/same-origin.*BFF|BFF.*same-origin/i);
  expect(doc).toMatch(/SalesChain credentials are server-only/i);
  expect(doc).toMatch(/URL fragments/i);
  expect(doc).toMatch(/No\s+database belongs in this repository/i);
});

test(".env.example declares expected variable names with no values", () => {
  const env = readFileSync(resolve(process.cwd(), ".env.example"), "utf-8");
  const assignmentLines = env
    .split("\n")
    .filter((line) => line.includes("=") && !line.trim().startsWith("#"));

  expect(assignmentLines.length).toBeGreaterThan(0);
  for (const line of assignmentLines) {
    const [, value] = line.split("=");
    expect(value.trim()).toBe("");
  }

  expect(env).toContain("SALESCHAIN_API_BASE_URL");
  expect(env).toContain("SALESCHAIN_BFF_CREDENTIAL");
  expect(env).toContain("NEXT_PUBLIC_TURNSTILE_SITE_KEY");
});
