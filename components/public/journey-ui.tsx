import type { ReactNode } from "react";
import { CheckboxField } from "@/components/ui/form";
import { StatusRegion } from "@/components/ui/StatusRegion";

/** The approved consent wording as the BFF returns it (see lib/public-journeys/consent.ts). */
export type ConsentText = { paragraphs: string[]; checkboxLabel: string };

export type PublicContextOk = {
  status: "OK";
  programmeName: string;
  brandName: string;
  attributionCorrelationId?: string;
  products?: { code: string; name: string; description: string | null }[];
  /** `version` is null only when no wording is approved at all (nothing was requested from SalesChain). */
  consent: { version: string | null; text: ConsentText | null };
};

/** Labels for the SalesChain partner types (the values are the contract's enum). */
export const partnerTypeOptions = [
  { value: "PRIVATE_REFERRER", label: "Privatperson mit Netzwerk" },
  { value: "BROKER_SALES_PROFESSIONAL", label: "Makler:in / Vertriebsprofi" },
  { value: "AFFILIATE_CONTENT_CREATOR", label: "Content-Creator / Affiliate" },
  { value: "DEVELOPER_CONSTRUCTION_COMPANY", label: "Bauträger / Bauunternehmen" },
  { value: "MANUFACTURER_PROVIDER", label: "Hersteller / Anbieter" },
  { value: "MEDIA_ADVERTISING_PARTNER", label: "Medien- / Werbepartner" },
  { value: "OTHER", label: "Sonstiges" },
];

/** A fixed, non-informative message. Never carries upstream detail. */
export function Notice({ tone = "info", children }: { tone?: "info" | "warning"; children: ReactNode }) {
  return (
    <StatusRegion tone={tone} className="max-w-2xl">
      {children}
    </StatusRegion>
  );
}

/**
 * The approved consent statement and its required, never pre-ticked checkbox.
 * Everything shown comes from the approved registry; nothing here is wording.
 */
export function ConsentBlock({ id, text }: { id: string; text: ConsentText }) {
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="font-semibold text-lg text-charcoal-900">Einwilligung</legend>
      {text.paragraphs.map((paragraph, index) => (
        <p key={index} className="text-sm leading-relaxed text-charcoal-700">
          {paragraph}
        </p>
      ))}
      <CheckboxField id={id} name={id} required label={text.checkboxLabel} />
    </fieldset>
  );
}

export const MESSAGES = {
  off: "Diese Seite ist derzeit nicht verfügbar.",
  loading: "Die Seite wird geladen …",
  linkUnavailable: "Dieser Link ist ungültig oder nicht mehr verfügbar.",
  serviceUnavailable:
    "Der Dienst ist vorübergehend nicht erreichbar. Bitte versuchen Sie es später erneut.",
  securityCheckUnavailable:
    "Die Sicherheitsprüfung ist derzeit nicht verfügbar. Das Formular kann deshalb nicht abgesendet werden.",
  consentPending:
    "Dieses Formular ist derzeit nicht verfügbar.",
  invalid: "Bitte prüfen Sie Ihre Angaben und versuchen Sie es erneut.",
  rateLimited: "Zu viele Anfragen. Bitte versuchen Sie es in Kürze erneut.",
  notAccepted: "Die Angaben konnten nicht angenommen werden. Bitte versuchen Sie es erneut.",
  retry:
    "Der Dienst ist vorübergehend nicht erreichbar. Ihre Eingaben bleiben erhalten; bitte versuchen Sie es erneut.",
} as const;

/** Maps a BFF answer to the one message the visitor sees. Identical for every cause behind a 404. */
export function messageForFailure(status: number): string {
  if (status === 400) return MESSAGES.invalid;
  if (status === 429) return MESSAGES.rateLimited;
  if (status === 404 || status === 409) return MESSAGES.notAccepted;
  return MESSAGES.retry;
}
