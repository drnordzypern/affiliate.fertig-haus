// @vitest-environment node
import { expect, test } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

// A source file that is read and re-written with the wrong code page turns "ö" into "Г¶" and an
// en dash into "вЂ“". This happened once to a form label that was merged; this test makes the
// whole public-journey surface fail loudly if it ever happens again.
const MOJIBAKE = /[\u0432][\u0402]|[\u0413][\u00B6\u00BC\u00A4\u0178\u0192\u00A9\u00DF]|[\u00C3][\u00B6\u00BC\u00A4\u0178]|\uFFFD/;
const roots = ["app/apply", "app/r", "app/api/applications", "app/api/referrals", "components/public", "lib/public-journeys"];

function files(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

test("no public-journey source contains code-page damage", () => {
  const offenders = roots
    .flatMap((root) => files(resolve(process.cwd(), root)))
    .filter((file) => MOJIBAKE.test(readFileSync(file, "utf8")));
  expect(offenders).toEqual([]);
});

test("the German labels keep their umlauts, dashes and ellipses exactly", () => {
  const form = readFileSync(resolve(process.cwd(), "components/public/ApplicationForm.tsx"), "utf8");
  for (const text of ["Persönliche Angaben & Kontakt", "Vielen Dank – Ihre Bewerbung ist eingegangen.", "geprüft", "Wird gesendet …"]) {
    expect(form).toContain(text);
  }
  const ui = readFileSync(resolve(process.cwd(), "components/public/journey-ui.tsx"), "utf8");
  for (const text of ["nicht verfügbar", "ungültig", "vorübergehend", "Bauträger"]) expect(ui).toContain(text);
});