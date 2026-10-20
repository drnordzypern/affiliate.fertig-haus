// @vitest-environment node
import { describe, expect, test } from "vitest";
import { approvedConsentTexts, type ApprovedConsent } from "@/lib/public-journeys/consent";

// Guards the day wording is approved and committed: an entry may not carry a version string the SalesChain API
// would refuse in production, or text that is still a placeholder. Today the registry is empty, so the
// real-registry check passes vacuously; the pure function below is exercised on bad and good samples.
const REFUSED_VERSION = /draft|placeholder|demo|fictional|tbd|todo/i;
const PLACEHOLDER_TEXT = /<[^>]*>|\bTODO\b|\bTBD\b|lorem ipsum|\bplatzhalter\b|\bentwurf\b|\bxxx+\b|\[[^\]]*\]/i;

function registryProblems(registry: Readonly<Record<string, ApprovedConsent>>): string[] {
  const problems: string[] = [];
  for (const [version, entry] of Object.entries(registry)) {
    if (version.trim().length === 0 || REFUSED_VERSION.test(version)) problems.push(`version "${version}" would be refused`);
    for (const [kind, text] of Object.entries(entry)) {
      if (!text) continue;
      const all = [...text.paragraphs, text.checkboxLabel];
      if (text.paragraphs.length === 0 || all.some((p) => p.trim().length === 0)) problems.push(`${version}/${kind} has empty text`);
      if (all.some((p) => PLACEHOLDER_TEXT.test(p))) problems.push(`${version}/${kind} still looks like a placeholder`);
    }
  }
  return problems;
}

describe("consent registry guard", () => {
  test("the committed registry has no refused version and no placeholder text", () => {
    expect(registryProblems(approvedConsentTexts)).toEqual([]);
  });

  test("flags refused versions, empty text and placeholders", () => {
    const text = { paragraphs: ["Ich willige ein."], checkboxLabel: "Ich willige ein." };
    expect(registryProblems({ "2026-draft-1": { customerReferral: text } })).toHaveLength(1);
    expect(registryProblems({ "v-tbd": { customerReferral: text } })).toHaveLength(1);
    expect(registryProblems({ v1: { customerReferral: { paragraphs: [" "], checkboxLabel: "ok" } } })).not.toEqual([]);
    expect(registryProblems({ v1: { partnerApplication: { paragraphs: ["<approved statement>"], checkboxLabel: "ok" } } })).toHaveLength(1);
    expect(registryProblems({ v1: { partnerApplication: { paragraphs: ["TODO"], checkboxLabel: "ok" } } })).toHaveLength(1);
  });

  test("accepts a complete, plain entry", () => {
    const text = { paragraphs: ["Ich willige in die Verarbeitung meiner Angaben ein."], checkboxLabel: "Ich willige ein." };
    expect(registryProblems({ "2026-11-01": { partnerApplication: text, customerReferral: text } })).toEqual([]);
  });
});
