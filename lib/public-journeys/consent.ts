/**
 * Consent wording for the two public forms.
 *
 * NO wording is approved yet, so this registry is deliberately EMPTY. Do not
 * add placeholder, draft or "temporary" text here: a form shows a consent
 * statement only when the owner has approved the exact wording for the exact
 * consent policy version the SalesChain Brand carries (its
 * `consentPolicyVersion`, which SalesChain records as consent evidence with
 * every submission).
 *
 * To approve wording: add one entry keyed by that version string, with the
 * approved statement and the approved checkbox label for each journey that
 * uses it, and commit it. Until an entry exists for the version SalesChain
 * reports, the form is not rendered at all (no fields, no checkbox, no submit
 * button) and the BFF refuses the submission, so no consent can be recorded
 * against text nobody approved.
 *
 * Example shape (not real wording, not for use):
 *   "<policy-version>": {
 *     partnerApplication: { paragraphs: ["<approved statement>"], checkboxLabel: "<approved label>" },
 *     customerReferral: { paragraphs: ["<approved statement>"], checkboxLabel: "<approved label>" },
 *   }
 */
export type ConsentKind = "partnerApplication" | "customerReferral";

export type ApprovedConsentText = {
  /** The approved statement shown above the checkbox. */
  readonly paragraphs: readonly string[];
  /** The approved label of the (required, unticked) consent checkbox. */
  readonly checkboxLabel: string;
};

export type ApprovedConsent = Partial<Record<ConsentKind, ApprovedConsentText>>;

export const approvedConsentTexts: Readonly<Record<string, ApprovedConsent>> = {};

/** True when wording is approved for this journey under ANY policy version. */
export function anyApprovedConsent(kind: ConsentKind): boolean {
  return Object.keys(approvedConsentTexts).some((version) => approvedConsentText(kind, version) !== null);
}

/** The approved wording for this journey and policy version, or null when none is approved. */
export function approvedConsentText(kind: ConsentKind, version: string): ApprovedConsentText | null {
  if (!Object.prototype.hasOwnProperty.call(approvedConsentTexts, version)) return null;
  const entry = approvedConsentTexts[version]?.[kind];
  if (!entry) return null;
  if (entry.paragraphs.length === 0 || entry.paragraphs.some((p) => p.trim().length === 0)) return null;
  if (entry.checkboxLabel.trim().length === 0) return null;
  return entry;
}