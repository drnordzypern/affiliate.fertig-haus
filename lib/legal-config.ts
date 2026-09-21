/**
 * Placeholder configuration point for legal document links.
 *
 * No approved Impressum or Datenschutz URL exists yet for the Partner
 * Portal. Do not invent one. Once legal provides the final documents,
 * replace these `href` values (and set `available: true`) — every place
 * that links to these documents reads from this file.
 */
export const legalLinks = {
  impressum: {
    label: "Impressum",
    href: undefined as string | undefined,
    available: false,
  },
  datenschutz: {
    label: "Datenschutz",
    href: undefined as string | undefined,
    available: false,
  },
};
