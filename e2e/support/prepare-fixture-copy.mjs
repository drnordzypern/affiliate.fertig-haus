// LOCAL TEST TOOLING ONLY.
//
// The shipped consent registry (lib/public-journeys/consent.ts) is EMPTY on
// purpose: no consent wording is approved, and the application must never carry
// a backdoor that lets configuration inject wording. To exercise the forms that
// only exist once wording is approved, the end-to-end test runs a SECOND copy of
// the application in which ONLY the registry line of consent.ts is replaced by a
// clearly-labelled fixture; every function in that file stays the shipped code.
// The original working tree is never modified, and the copies are git-ignored.
//
// Usage: node e2e/support/prepare-fixture-copy.mjs fixture   (E2E_CONSENT_VERSION required; creates .e2e-consent-copy)
//        node e2e/support/prepare-fixture-copy.mjs plain     (an unmodified copy; creates .e2e-gates-closed-copy)
// A plain copy exists only because two `next dev` servers cannot share one project directory.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const mode = process.argv[2];
if (mode !== "fixture" && mode !== "plain") throw new Error("usage: prepare-fixture-copy.mjs fixture|plain");
const copy = join(root, mode === "fixture" ? ".e2e-consent-copy" : ".e2e-gates-closed-copy");
const version = process.env.E2E_CONSENT_VERSION;
if (mode === "fixture" && !version) throw new Error("E2E_CONSENT_VERSION is required");

rmSync(copy, { recursive: true, force: true });
mkdirSync(copy, { recursive: true });
for (const entry of ["app", "components", "lib", "public", "proxy.ts", "next.config.ts", "tsconfig.json", "postcss.config.mjs", "package.json"]) {
  if (existsSync(join(root, entry))) cpSync(join(root, entry), join(copy, entry), { recursive: true });
}
symlinkSync(join(root, "node_modules"), join(copy, "node_modules"), "junction");

if (mode === "fixture") {
  const registryLine = "export const approvedConsentTexts: Readonly<Record<string, ApprovedConsent>> = {};";
  const file = join(copy, "lib/public-journeys/consent.ts");
  const source = readFileSync(file, "utf8");
  if (!source.includes(registryLine)) throw new Error("the shipped registry line was not found; update this script");
  const fixture = `// E2E FIXTURE (not approved wording; exists only in the git-ignored copy used by the local end-to-end test).
export const approvedConsentTexts: Readonly<Record<string, ApprovedConsent>> = {
  ${JSON.stringify(version)}: {
    partnerApplication: {
      paragraphs: ["E2E FIXTURE WORDING (not approved text): partner application statement."],
      checkboxLabel: "E2E fixture checkbox: partner application",
    },
    customerReferral: {
      paragraphs: ["E2E FIXTURE WORDING (not approved text): customer referral statement."],
      checkboxLabel: "E2E fixture checkbox: customer referral",
    },
  },
};`;
  writeFileSync(file, source.replace(registryLine, fixture));
}
console.log(`${mode} copy ready: ${copy}`);
