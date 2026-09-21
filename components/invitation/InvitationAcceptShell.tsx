import { Card } from "@/components/ui/Card";
import { Badge, PreviewBadge } from "@/components/ui/Badge";
import { StatusRegion } from "@/components/ui/StatusRegion";

/**
 * Visual shell for the future invitation-acceptance flow.
 *
 * This component intentionally contains no logic. It does not read
 * `window.location`, `searchParams`, or any URL fragment, and it does not
 * call the SalesChain boundary. It only renders static preview states so
 * the final SalesChain contract can be reviewed before any behavior is
 * added.
 *
 * Structure for a later phase (not implemented here):
 * - A client component reads the invitation token from the URL fragment
 *   only (never a query string), and scrubs the fragment from the address
 *   bar immediately after reading it.
 * - The token is held in memory only — never written to storage, state
 *   that persists across reloads, logs, or analytics.
 * - A Turnstile challenge runs before the token is submitted.
 * - The token is submitted to a same-origin BFF route, which forwards it
 *   to the SalesChain public/API boundary. The BFF response is generic
 *   (accepted / unavailable) and never echoes the raw token back.
 */
const previewStates = [
  {
    label: "Prüfung läuft",
    tone: "neutral" as const,
    description:
      "So könnte die Ansicht aussehen, während eine Einladung geprüft wird.",
  },
  {
    label: "Angenommen",
    tone: "olive" as const,
    description:
      "So könnte die Bestätigung nach erfolgreicher Aktivierung aussehen.",
  },
  {
    label: "Nicht verfügbar",
    tone: "terracotta" as const,
    description:
      "So könnte die Meldung bei einer abgelaufenen oder ungültigen Einladung aussehen.",
  },
];

export function InvitationAcceptShell() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <PreviewBadge />
        <h1 className="font-serif text-3xl text-charcoal-900 sm:text-4xl">
          Einladung annehmen
        </h1>
        <p className="max-w-xl text-base leading-relaxed text-charcoal-500">
          Dieser Bereich zeigt die künftige Ansicht zur Annahme einer
          Partner-Einladung. Die sichere Aktivierung ist in dieser Vorschau
          noch nicht konfiguriert.
        </p>
      </div>

      <StatusRegion tone="warning" className="max-w-2xl">
        Diese Seite verarbeitet aktuell{" "}
        <strong>keine echte Einladung</strong>. Es wird kein Token gelesen,
        gespeichert oder an einen Dienst übermittelt. Ein aufgerufener Link
        hat hier keine Wirkung.
      </StatusRegion>

      <Card className="max-w-2xl">
        <p className="text-sm font-medium text-charcoal-900">
          Aktueller Status dieser Vorschau
        </p>
        <p className="mt-2 text-sm leading-relaxed text-charcoal-500">
          Die sichere Anbindung an SalesChain (Token-Prüfung, Turnstile und
          Bestätigung) ist noch nicht aktiviert. Unten sehen Sie beispielhaft,
          wie die späteren Zustände gestaltet sein könnten.
        </p>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        {previewStates.map((state) => (
          <Card key={state.label} className="flex flex-col gap-3">
            <p className="text-xs font-medium tracking-wide text-charcoal-500 uppercase">
              Beispielzustand — nicht real
            </p>
            <Badge tone={state.tone}>{state.label}</Badge>
            <p className="text-sm leading-relaxed text-charcoal-500">
              {state.description}
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
}
