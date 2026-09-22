import type { Metadata } from "next";
import { Section } from "@/components/ui/Section";
import { Card } from "@/components/ui/Card";
import { PreviewBadge } from "@/components/ui/Badge";
import { StatusRegion } from "@/components/ui/StatusRegion";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { PortalNav } from "@/components/portal/PortalNav";
import { LogoutButton } from "@/components/portal/LogoutButton";

export const metadata: Metadata = {
  title: "Partnerportal",
  description:
    "Vorschau der künftigen Informationsarchitektur des Fertig Haus Partnerportals. Keine echten Empfehlungs- oder Provisionsdaten.",
};

/**
 * This page still renders only the static preview information
 * architecture — no real Partner/lead/commission data. It does not read
 * the Partner-session cookie or gate itself on it: cookie *presence* is
 * not proof of a live, authenticated SalesChain session (SalesChain has
 * no `whoami` endpoint yet), so treating it as an auth gate here would be
 * exactly the false authority this integration must not claim. The
 * cookie's only current use is the HttpOnly bearer token the logout BFF
 * route reads server-side. A future protected Partner-resource request
 * must authorize itself against SalesChain on every call, not rely on
 * this cookie's mere presence.
 */
export default function PortalPage() {
  return (
    <Section className="pt-16 pb-24 sm:pt-20">
      <div className="flex flex-col gap-3">
        <PreviewBadge />
        <h1 className="font-serif text-3xl text-charcoal-900 sm:text-4xl">
          Partnerportal
        </h1>
        <p className="max-w-2xl text-base leading-relaxed text-charcoal-500">
          Diese Ansicht zeigt die geplante Struktur des Partnerportals. Sie
          ist eine visuelle Vorschau ohne echte Partnerdaten und ohne
          Verbindung zu SalesChain.
        </p>
      </div>

      <StatusRegion tone="warning" className="mt-6 max-w-2xl">
        Diese Seite zeigt keine echten Empfehlungen, Leads oder Provisionen.
        Alle Inhalte dienen ausschließlich der Darstellung der künftigen
        Struktur.
      </StatusRegion>

      <div className="mt-6">
        <LogoutButton />
      </div>

      <div className="mt-12 flex flex-col gap-10 sm:flex-row">
        <PortalNav />

        <div className="flex flex-1 flex-col gap-16">
          <section id="uebersicht" aria-labelledby="uebersicht-heading">
            <h2
              id="uebersicht-heading"
              className="font-serif text-2xl text-charcoal-900"
            >
              Übersicht
            </h2>
            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <Card>
                <p className="text-sm font-medium text-charcoal-900">
                  Onboarding-Checkliste
                </p>
                <ul className="mt-4 flex flex-col gap-3 text-sm text-charcoal-500">
                  <li className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="h-4 w-4 rounded-full border border-stone-300"
                    />
                    Partnerbewerbung einreichen
                  </li>
                  <li className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="h-4 w-4 rounded-full border border-stone-300"
                    />
                    Einladung annehmen
                  </li>
                  <li className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="h-4 w-4 rounded-full border border-stone-300"
                    />
                    Persönlichen Link aktivieren
                  </li>
                  <li className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="h-4 w-4 rounded-full border border-stone-300"
                    />
                    Erste Empfehlung einreichen
                  </li>
                </ul>
              </Card>

              <Card>
                <p className="text-sm font-medium text-charcoal-900">
                  Empfehlungs-Trichter
                </p>
                <div className="mt-4">
                  <EmptyState
                    title="Noch keine Empfehlungen"
                    description="Sobald Empfehlungen eingehen, erscheint hier eine Übersicht nach Status."
                  />
                </div>
              </Card>
            </div>

            <Card className="mt-6">
              <p className="text-sm font-medium text-charcoal-900">
                Letzte Aktivität
              </p>
              <p className="mt-1 text-xs text-charcoal-500">
                Beispielhafte Darstellung des Ladezustands, solange keine
                Aktivität vorliegt.
              </p>
              <div className="mt-4 flex flex-col gap-2" aria-hidden="true">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </Card>
          </section>

          <section id="empfehlungen" aria-labelledby="empfehlungen-heading">
            <h2
              id="empfehlungen-heading"
              className="font-serif text-2xl text-charcoal-900"
            >
              Empfehlungen
            </h2>
            <div className="mt-6">
              <EmptyState
                title="Keine Empfehlungen vorhanden"
                description="Eingereichte Empfehlungen erscheinen hier mit ihrem jeweiligen Bearbeitungsstatus, sobald das Partnerprogramm aktiv ist."
              />
            </div>
          </section>

          <section id="qr-partnerlink" aria-labelledby="qr-partnerlink-heading">
            <h2
              id="qr-partnerlink-heading"
              className="font-serif text-2xl text-charcoal-900"
            >
              QR-Code & Partnerlink
            </h2>
            <Card className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-center">
              <div
                aria-hidden="true"
                className="flex h-32 w-32 shrink-0 items-center justify-center rounded-sm border border-dashed border-stone-300 bg-stone-100 text-center text-xs text-charcoal-500"
              >
                QR-Code folgt nach Freigabe
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <label
                  htmlFor="partnerlink-placeholder"
                  className="text-sm font-medium text-charcoal-900"
                >
                  Ihr persönlicher Partnerlink
                </label>
                <input
                  id="partnerlink-placeholder"
                  disabled
                  value="Wird nach Freigabe aktiviert"
                  readOnly
                  className="w-full max-w-sm rounded-sm border border-stone-300 bg-stone-100 px-3.5 py-2.5 text-sm text-charcoal-500"
                />
                <p className="text-xs text-charcoal-500">
                  Kein funktionsfähiger Referral-Code. Link und QR-Code
                  werden erst nach Aufnahme in das Partnerprogramm erzeugt.
                </p>
              </div>
            </Card>
          </section>

          <section id="provisionen" aria-labelledby="provisionen-heading">
            <h2
              id="provisionen-heading"
              className="font-serif text-2xl text-charcoal-900"
            >
              Provisionen
            </h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {["Offen", "Bestätigt", "Ausgezahlt"].map((label) => (
                <Card key={label}>
                  <p className="text-xs font-medium tracking-wide text-charcoal-500 uppercase">
                    {label}
                  </p>
                  <p className="mt-3 font-serif text-3xl text-charcoal-900">
                    —
                  </p>
                </Card>
              ))}
            </div>
            <p className="mt-4 text-xs text-charcoal-500">
              Beträge werden erst nach Vertragsschluss und Erfüllung der
              Programmregeln angezeigt.
            </p>
          </section>

          <section id="materialien" aria-labelledby="materialien-heading">
            <h2
              id="materialien-heading"
              className="font-serif text-2xl text-charcoal-900"
            >
              Materialien
            </h2>
            <div className="mt-6">
              <EmptyState
                title="Noch keine Materialien verfügbar"
                description="Verkaufs- und Empfehlungsmaterialien werden nach Programmstart bereitgestellt."
              />
            </div>
          </section>

          <section id="akademie-events" aria-labelledby="akademie-events-heading">
            <h2
              id="akademie-events-heading"
              className="font-serif text-2xl text-charcoal-900"
            >
              Akademie & Events
            </h2>
            <div className="mt-6">
              <EmptyState
                title="In Vorbereitung"
                description="Schulungsinhalte und Veranstaltungen für Partner:innen folgen zu einem späteren Zeitpunkt."
              />
            </div>
          </section>

          <section
            id="profil-einstellungen"
            aria-labelledby="profil-einstellungen-heading"
          >
            <h2
              id="profil-einstellungen-heading"
              className="font-serif text-2xl text-charcoal-900"
            >
              Profil & Einstellungen
            </h2>
            <Card className="mt-6 grid gap-5 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-charcoal-900">
                  Name
                </span>
                <span className="rounded-sm border border-stone-300 bg-stone-100 px-3.5 py-2.5 text-sm text-charcoal-500">
                  Wird nach Anmeldung angezeigt
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-charcoal-900">
                  E-Mail
                </span>
                <span className="rounded-sm border border-stone-300 bg-stone-100 px-3.5 py-2.5 text-sm text-charcoal-500">
                  Wird nach Anmeldung angezeigt
                </span>
              </div>
            </Card>
          </section>
        </div>
      </div>
    </Section>
  );
}
