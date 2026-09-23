import type { Metadata } from "next";
import { Section, SectionHeading } from "@/components/ui/Section";
import { Card } from "@/components/ui/Card";
import { StatusRegion } from "@/components/ui/StatusRegion";
import { InactiveBadge } from "@/components/ui/Badge";
import {
  TextField,
  TextAreaField,
  SelectField,
  CheckboxField,
} from "@/components/ui/form";

export const metadata: Metadata = {
  title: "Partner werden",
  description:
    "Die Bewerbungsstrecke für das Fertig Haus Partnerprogramm ist derzeit nicht aktiv. Diese Seite nimmt keine echten Bewerbungen entgegen.",
};

const partnerTypes = [
  { value: "privatperson", label: "Privatperson mit Netzwerk" },
  { value: "immobilien-bau", label: "Immobilien- oder Baufachperson" },
  { value: "beratung", label: "Regionale:r Berater:in" },
  { value: "geschaeftspartner", label: "Geschäftspartner" },
];

const cooperationContexts = [
  { value: "einzelempfehlungen", label: "Gelegentliche Einzelempfehlungen" },
  { value: "regelmaessig", label: "Regelmäßige Zusammenarbeit" },
  { value: "veranstaltungen", label: "Veranstaltungen / Multiplikation" },
];

export default function PartnerWerdenPage() {
  return (
    <Section className="pt-16 pb-24 sm:pt-20">
      <div className="flex flex-col gap-3">
        <InactiveBadge />
        <SectionHeading
          level="h1"
          eyebrow="Partner werden"
          title="Bewerbungsstrecke derzeit nicht aktiv"
          description="Diese Ansicht zeigt die geplante Struktur der künftigen Partnerbewerbung. Sie dient ausschließlich der Darstellung und nimmt keine Eingaben entgegen."
        />
      </div>

      <StatusRegion tone="warning" className="mt-8 max-w-2xl">
        Dieses Formular ist <strong>derzeit nicht aktiv</strong>.
        Es sendet keine Daten, speichert nichts lokal und die
        Absende-Schaltfläche ist bewusst deaktiviert. Bitte tragen Sie hier
        keine echten persönlichen Daten ein.
      </StatusRegion>

      <Card className="mt-10 max-w-3xl">
        <form
          aria-describedby="form-preview-notice"
          className="flex flex-col gap-10"
        >
          <fieldset disabled className="flex flex-col gap-5">
            <legend className="font-serif text-lg text-charcoal-900">
              Persönliche Angaben & Kontakt
            </legend>
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField id="vorname" label="Vorname" required autoComplete="off" />
              <TextField id="nachname" label="Nachname" required autoComplete="off" />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                id="email"
                label="E-Mail-Adresse"
                type="email"
                required
                autoComplete="off"
              />
              <TextField
                id="telefon"
                label="Telefon (optional)"
                type="tel"
                autoComplete="off"
              />
            </div>
          </fieldset>

          <fieldset disabled className="flex flex-col gap-5">
            <legend className="font-serif text-lg text-charcoal-900">
              Partnertyp & Region
            </legend>
            <div className="grid gap-5 sm:grid-cols-2">
              <SelectField
                id="partnertyp"
                label="Partnertyp"
                required
                options={partnerTypes}
              />
              <TextField
                id="region"
                label="Region / Bundesland"
                required
                autoComplete="off"
              />
            </div>
          </fieldset>

          <fieldset disabled className="flex flex-col gap-5">
            <legend className="font-serif text-lg text-charcoal-900">
              Erfahrung & Kooperation
            </legend>
            <TextAreaField
              id="erfahrung"
              label="Relevante Erfahrung / Netzwerk"
              hint="Beschreiben Sie kurz, in welchem Umfeld Sie Empfehlungen aussprechen möchten."
            />
            <SelectField
              id="kooperationskontext"
              label="Bevorzugter Kooperationskontext"
              options={cooperationContexts}
            />
          </fieldset>

          <fieldset disabled className="flex flex-col gap-4">
            <legend className="font-serif text-lg text-charcoal-900">
              Einwilligung
            </legend>
            <CheckboxField
              id="einwilligung"
              label={
                <>
                  Ich habe die Hinweise zur Datenverarbeitung zur Kenntnis
                  genommen.{" "}
                  <em className="not-italic text-charcoal-500">
                    Vorläufiger Text – der endgültige, rechtlich geprüfte
                    Einwilligungstext wird vor Aktivierung dieser Funktion
                    ergänzt.
                  </em>
                </>
              }
            />
          </fieldset>

          <div className="flex flex-col gap-3 border-t border-stone-200 pt-6">
            <button
              type="submit"
              disabled
              aria-describedby="form-preview-notice"
              className="inline-flex w-fit cursor-not-allowed items-center justify-center rounded-sm border border-charcoal-900/30 bg-stone-200 px-6 py-3 text-sm font-medium text-charcoal-500"
            >
              Bewerbung absenden
            </button>
            <p id="form-preview-notice" className="text-xs text-charcoal-500">
              Die Absende-Funktion ist derzeit deaktiviert, da die
              Anbindung an die Bewerbungsprüfung noch nicht konfiguriert ist.
            </p>
          </div>
        </form>
      </Card>
    </Section>
  );
}
