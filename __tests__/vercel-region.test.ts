import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

// The server side of this app (the BFF that relays applications, enquiries and invitation acceptances to SalesChain,
// and the portal that reads a partner's own links) handles personal data. It runs in Frankfurt, next to the SalesChain
// API (fra1) and the Neon database (AWS eu-central-1); without this file Vercel uses its default region iad1 (USA).
test("Vercel functions run only in Frankfurt (fra1)", () => {
  const config = JSON.parse(readFileSync(resolve(__dirname, "../vercel.json"), "utf8")) as Record<string, unknown>;
  expect(config.regions).toEqual(["fra1"]);
  // nothing else is configured here: build, headers and routing stay with Next.js
  expect(Object.keys(config).sort()).toEqual(["$schema", "regions"]);
});
