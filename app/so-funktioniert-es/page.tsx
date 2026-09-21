import type { Metadata } from "next";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Section, SectionHeading } from "@/components/ui/Section";
import { StatusRegion } from "@/components/ui/StatusRegion";

export const metadata: Metadata = {
  title: "So funktioniert es",
  description:
    "Der geplante Ablauf des Fertig Haus Partnerprogramms – von der Bewerbung bis zur Provisionsinformation.",
};

const lifecycle = [
  {
    title: "Bewerbung",
    description:
      "Interessierte Personen oder Organisationen reichen eine Bewerbung für das Partnerprogramm ein.",
    status: "future" as const,
  },
  {
    title: "Prüfung & Freigabe",
    description:
      "Fertig Haus prüft jede Bewerbung individuell und entscheidet über die Aufnahme.",
    status: "future" as const,
  },
  {
    title: "Sicherer Partnerzugang",
    description:
      "Nach Freigabe erhalten Partner:innen über eine Einladung Zugang zum geschützten Partnerbereich.",
    status: "future" as const,
  },
  {
    title: "Persönlicher Link & QR-Code",
    description:
      "Ein individueller Referral-Link sowie ein QR-Code werden für Empfehlungen bereitgestellt.",
    status: "future" as const,
  },
  {
    title: "Zuordnung von Empfehlungen",
    description:
      "Über den Link oder QR-Code eingehende Empfehlungen werden der jeweiligen Partnerin bzw. dem Partner zugeordnet.",
    status: "future" as const,
  },
  {
    title: "Fortschritt der Empfehlung",
    description:
      "Der Bearbeitungsstatus einer Empfehlung ist für die Partnerin bzw. den Partner nachvollziehbar einsehbar.",
    status: "future" as const,
  },
  {
    title: "Provisionsberechtigung & -auszahlung",
    description:
      "Bei Erfüllung der vertraglichen Programmregeln erfolgen Provisionsinformation und -auszahlung gemäß den geltenden Bedingungen.",
    status: "future" as const,
  },
];

export default function SoFunktioniertEsPage() {
  return (
    <>
      <Section className="pt-16 sm:pt-20">
        <SectionHeading
          level="h1"
          eyebrow="So funktioniert es"
          title="Der geplante Ablauf des Partnerprogramms"
          description="Die folgenden Schritte beschreiben den vorgesehenen Lebenszyklus einer Partnerschaft und einer Empfehlung. Sie beschreiben die künftige Funktionsweise – aktuell befindet sich diese Seite in der Vorschau."
        />
        <StatusRegion tone="warning" className="mt-8 max-w-2xl">
          Alle unten aufgeführten Schritte sind derzeit{" "}
          <strong>nicht funktionsfähig</strong>. Es handelt sich um eine
          inhaltliche Vorschau der künftigen Abläufe.
        </StatusRegion>
      </Section>

      <Section tone="muted" className="pt-0 sm:pt-0">
        <h2 className="sr-only">Ablaufschritte</h2>
        <ol className="grid gap-6">
          {lifecycle.map((item, index) => (
            <li key={item.title}>
              <Card className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-6">
                <div className="flex items-center gap-4 sm:w-40 sm:shrink-0">
                  <span className="font-serif text-2xl text-olive-600">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <Badge tone="neutral">Geplant</Badge>
                </div>
                <div>
                  <h3 className="text-base font-medium text-charcoal-900">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-charcoal-500">
                    {item.description}
                  </p>
                </div>
              </Card>
            </li>
          ))}
        </ol>
      </Section>

      <Section>
        <div className="flex flex-col items-start gap-6">
          <h2 className="font-serif text-2xl text-charcoal-900">
            Bereits als Vorschau verfügbar
          </h2>
          <p className="max-w-2xl text-sm leading-relaxed text-charcoal-500">
            Sie können sich schon jetzt die geplante Struktur der Bewerbung
            sowie des Partnerportals ansehen. Beide Bereiche sind als
            nicht-funktionale Vorschau gekennzeichnet.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button href="/partner-werden" variant="primary">
              Bewerbungsvorschau ansehen
            </Button>
            <Button href="/portal" variant="secondary">
              Partnerportal-Vorschau ansehen
            </Button>
          </div>
        </div>
      </Section>
    </>
  );
}
