// @vitest-environment node
import { describe, expect, test } from "vitest";
import { approvedConsentTexts, type ApprovedConsent } from "@/lib/public-journeys/consent";
import { legalLinks } from "@/lib/legal-config";

// Guards the day wording is approved and committed: an entry may not carry a version string the SalesChain API
// would refuse in production, or text that is still a placeholder. Today the registry is empty, so the
// real-registry check passes vacuously; the pure function below is exercised on bad and good samples.
const REFUSED_VERSION = /draft|placeholder|demo|fictional|tbd|todo/i;
const PLACEHOLDER_TEXT = /<[^>]*>|\bTODO\b|\bTBD\b|lorem ipsum|\bplatzhalter\b|\bentwurf\b|\bxxx+\b|\[[^\]]*\]/i;
// Test and review wording must never reach a real registry either: the hosted test environment and the end-to-end suite use clearly labelled fixture text.
const TEST_WORDING = /\bfixture\b|not approved|nicht freigegeben|\be2e\b|\bprovisional\b|pending approval|\bdraft\b/i;

function registryProblems(registry: Readonly<Record<string, ApprovedConsent>>): string[] {
  const problems: string[] = [];
  for (const [version, entry] of Object.entries(registry)) {
    if (version.trim().length === 0 || REFUSED_VERSION.test(version)) problems.push(`version "${version}" would be refused`);
    for (const [kind, text] of Object.entries(entry)) {
      if (!text) continue;
      const all = [...text.paragraphs, text.checkboxLabel];
      if (text.paragraphs.length === 0 || all.some((p) => p.trim().length === 0)) problems.push(`${version}/${kind} has empty text`);
      if (all.some((p) => PLACEHOLDER_TEXT.test(p))) problems.push(`${version}/${kind} still looks like a placeholder`);
      if (all.some((p) => TEST_WORDING.test(p))) problems.push(`${version}/${kind} carries test or review wording`);
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

  test("flags the labelled fixture wording used by the hosted test environment and the end-to-end suite", () => {
    const fixture = { paragraphs: ["E2E FIXTURE WORDING (not approved text): customer referral statement."], checkboxLabel: "E2E fixture checkbox: customer referral" };
    expect(registryProblems({ "2026-11-01": { customerReferral: fixture } })).toHaveLength(1);
    expect(registryProblems({ v1: { customerReferral: { paragraphs: ["Text, noch nicht freigegeben."], checkboxLabel: "ok" } } })).toHaveLength(1);
    expect(registryProblems({ v1: { customerReferral: { paragraphs: ["Text (pending approval)."], checkboxLabel: "ok" } } })).toHaveLength(1);
  });

  test("accepts a complete, plain entry", () => {
    const text = { paragraphs: ["Ich willige in die Verarbeitung meiner Angaben ein."], checkboxLabel: "Ich willige ein." };
    expect(registryProblems({ "2026-11-01": { partnerApplication: text, customerReferral: text } })).toEqual([]);
  });
});

describe("legal links", () => {
  // The footer renders a legal link only when it is available AND has an href. Once the owner decides, a link
  // must be a complete https URL on fertig-haus.net, never half-configured and never a placeholder.
  test.each(Object.entries(legalLinks))("%s is either fully absent or a complete https fertig-haus.net URL", (_name, entry) => {
    if (!entry.available) {
      expect(entry.href).toBeUndefined();
      return;
    }
    expect(entry.href).toBeDefined();
    const url = new URL(entry.href as string);
    expect(url.protocol).toBe("https:");
    expect(["fertig-haus.net", "www.fertig-haus.net"]).toContain(url.hostname);
    expect(url.search + url.hash).toBe("");
  });

  test("a link marked available without an href, or with one while unavailable, is a failure", () => {
    const bad = [{ available: true, href: undefined }, { available: false, href: "https://fertig-haus.net/impressum" }];
    for (const entry of bad) expect(entry.available === Boolean(entry.href)).toBe(false);
  });
});
