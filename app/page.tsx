import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Section, SectionHeading } from "@/components/ui/Section";

const processSteps = [
  {
    step: "01",
    title: "Bewerbung einreichen",
    description:
      "Sie stellen sich und Ihr Netzwerk in einer kurzen Bewerbung vor.",
  },
  {
    step: "02",
    title: "Prüfung & Freigabe",
    description:
      "Fertig Haus prüft Ihre Bewerbung und entscheidet über die Aufnahme in das Partnerprogramm.",
  },
  {
    step: "03",
    title: "Persönlicher Link & QR-Code",
    description:
      "Nach Freigabe erhalten Sie einen individuellen Referral-Link und QR-Code für Ihre Empfehlungen.",
  },
  {
    step: "04",
    title: "Empfehlungen verfolgen",
    description:
      "Sie sehen den Status Ihrer eingereichten Empfehlungen im Partnerportal.",
  },
  {
    step: "05",
    title: "Provisionsinformationen",
    description:
      "Bei Erfüllung der vertraglichen Voraussetzungen erhalten Sie transparente Provisionsinformationen.",
  },
];

const benefits = [
  {
    title: "Digitale Empfehlungswerkzeuge",
    description:
      "Ein persönlicher Referral-Link und QR-Code, um passende Interessentinnen und Interessenten einfach weiterzuempfehlen.",
  },
  {
    title: "Transparente Statusübersicht",
    description:
      "Der Bearbeitungsstand Ihrer Empfehlungen ist jederzeit nachvollziehbar im Partnerportal einsehbar.",
  },
  {
    title: "Zentrale Partnerressourcen",
    description:
      "Materialien, Informationen und künftige Schulungsinhalte an einem Ort.",
  },
  {
    title: "Datenschutzbewusster Prozess",
    description:
      "Empfehlungen und Partneraktivitäten werden sicherheits- und datenschutzbewusst verarbeitet.",
  },
  {
    title: "Akademie & Events",
    description:
      "Zukünftiger Zugang zu Schulungen und Veranstaltungen rund um das Partnerprogramm.",
  },
];

const audiences = [
  {
    title: "Privatpersonen mit relevantem Netzwerk",
    description:
      "Sie kennen Menschen, die über den Bau oder Kauf eines Fertighauses nachdenken.",
  },
  {
    title: "Immobilien- und Baufachleute",
    description:
      "Makler:innen, Architekt:innen und weitere Fachleute mit Berührung zum Hausbau.",
  },
  {
    title: "Regionale Berater:innen",
    description:
      "Beratende mit lokaler Marktkenntnis und Vertrauen bei ihren Kund:innen.",
  },
  {
    title: "Geschäftspartner",
    description:
      "Unternehmen, die im Rahmen einer Kooperation qualifizierte Empfehlungen aussprechen möchten.",
  },
];

const trustPoints = [
  {
    title: "Zugang ausschließlich auf Einladung",
    description:
      "Der Partnerbereich wird erst nach Freigabe und Einladung zugänglich – kein offener Self-Service-Login.",
  },
  {
    title: "Geschützte öffentliche Formulare",
    description:
      "Formulare für Bewerbung und Empfehlung sind für den produktiven Betrieb gegen Missbrauch abgesichert konzipiert.",
  },
  {
    title: "Keine sensiblen Daten öffentlich sichtbar",
    description:
      "Empfehlungs-, Kontakt- und Provisionsdaten werden nicht öffentlich angezeigt.",
  },
  {
    title: "Nachvollziehbare Partnerverifizierung",
    description:
      "Die Aufnahme als Partner:in folgt einem transparenten Prüfprozess.",
  },
];

export default function Home() {
  return (
    <>
      <Section className="pt-16 sm:pt-20">
        <div className="grid gap-12 sm:grid-cols-[1.1fr_0.9fr] sm:items-center">
          <div className="flex flex-col gap-6">
            <Badge tone="olive">Fertig Haus Partnerprogramm</Badge>
            <h1 className="font-serif text-4xl leading-tight text-charcoal-900 sm:text-5xl">
              Empfehlen Sie Fertig Haus weiter – als Partnerin oder Partner.
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-charcoal-500">
              Das Fertig Haus Partnerportal richtet sich an Menschen und
              Organisationen, die passende Interessentinnen und Interessenten
              verantwortungsvoll empfehlen möchten – mit einem persönlichen
              Referral-Link, nachvollziehbarem Empfehlungsstatus und
              transparenten Provisionsinformationen.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button href="/partner-werden" variant="primary">
                Partner werden
              </Button>
              <Button href="/so-funktioniert-es" variant="secondary">
                So funktioniert es
              </Button>
            </div>
            <p className="text-xs text-charcoal-500">
              Hinweis: Die Bewerbungsstrecke ist derzeit nicht aktiv. Der
              Zugang zum Partnerportal erfolgt ausschließlich über eine
              persönliche Einladung.
            </p>
          </div>

          <Card className="bg-stone-100/70">
            <p className="text-xs font-medium tracking-wide text-olive-700 uppercase">
              Auf einen Blick
            </p>
            <ul className="mt-5 flex flex-col gap-4 text-sm text-charcoal-700">
              <li className="flex gap-3">
                <span aria-hidden="true" className="text-olive-600">
                  —
                </span>
                Bewerbung mit anschließender Prüfung durch Fertig Haus
              </li>
              <li className="flex gap-3">
                <span aria-hidden="true" className="text-olive-600">
                  —
                </span>
                Individueller Referral-Link und QR-Code nach Freigabe
              </li>
              <li className="flex gap-3">
                <span aria-hidden="true" className="text-olive-600">
                  —
                </span>
                Transparente Statusverfolgung Ihrer Empfehlungen
              </li>
              <li className="flex gap-3">
                <span aria-hidden="true" className="text-olive-600">
                  —
                </span>
                Provisionsinformationen bei Erfüllung der Programmregeln
              </li>
            </ul>
          </Card>
        </div>
      </Section>

      <Section tone="muted">
        <SectionHeading
          eyebrow="Ablauf"
          title="So funktioniert es"
          description="Vom Antrag bis zur Provisionsinformation – ein nachvollziehbarer Prozess."
        />
        <ol className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
          {processSteps.map((item) => (
            <li key={item.step}>
              <Card className="h-full">
                <span className="font-serif text-2xl text-olive-600">
                  {item.step}
                </span>
                <h3 className="mt-3 text-base font-medium text-charcoal-900">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-charcoal-500">
                  {item.description}
                </p>
              </Card>
            </li>
          ))}
        </ol>
        <div className="mt-8">
          <Link
            href="/so-funktioniert-es"
            className="text-sm font-medium text-olive-700 hover:text-olive-900"
          >
            Details zum gesamten Ablauf ansehen →
          </Link>
        </div>
      </Section>

      <Section id="vorteile">
        <SectionHeading
          eyebrow="Vorteile"
          title="Was Partner:innen erwartet"
          description="Werkzeuge und Informationen, die eine verantwortungsvolle Empfehlung unterstützen."
        />
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {benefits.map((benefit) => (
            <Card key={benefit.title}>
              <h3 className="text-base font-medium text-charcoal-900">
                {benefit.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-charcoal-500">
                {benefit.description}
              </p>
            </Card>
          ))}
        </div>
      </Section>

      <Section tone="muted">
        <SectionHeading
          eyebrow="Für wen"
          title="Für wen sich das Programm eignet"
          description="Das Partnerprogramm richtet sich an unterschiedliche Netzwerke rund um den Hausbau."
        />
        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {audiences.map((audience) => (
            <div
              key={audience.title}
              className="flex flex-col gap-2 border-b border-stone-200 pb-6"
            >
              <h3 className="text-base font-medium text-charcoal-900">
                {audience.title}
              </h3>
              <p className="text-sm leading-relaxed text-charcoal-500">
                {audience.description}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <SectionHeading
          eyebrow="Vertrauen & Sicherheit"
          title="Sorgfalt im Umgang mit Partnerdaten"
          description="Der Zugang zum Partnerbereich und die Verarbeitung von Empfehlungen folgen klaren Sicherheitsprinzipien."
        />
        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {trustPoints.map((point) => (
            <Card key={point.title}>
              <h3 className="text-base font-medium text-charcoal-900">
                {point.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-charcoal-500">
                {point.description}
              </p>
            </Card>
          ))}
        </div>
      </Section>

      <Section tone="muted">
        <div className="flex flex-col items-start gap-6 sm:items-center sm:text-center">
          <h2 className="font-serif text-3xl text-charcoal-900 sm:text-4xl">
            Interesse am Fertig Haus Partnerprogramm?
          </h2>
          <p className="max-w-xl text-base leading-relaxed text-charcoal-500">
            Die Bewerbungsstrecke ist derzeit nicht aktiv. Eine verbindliche
            Aufnahme, garantierte Provisionen oder eine sofortige
            Kontoerstellung sind damit nicht verbunden.
          </p>
          <Button href="/partner-werden" variant="primary">
            Bewerbungsstrecke ansehen
          </Button>
        </div>
      </Section>
    </>
  );
}
