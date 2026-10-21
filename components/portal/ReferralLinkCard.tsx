import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { CopyLinkButton } from "@/components/portal/CopyLinkButton";

export type PortalReferralLink = {
  purpose: "CUSTOMER_REFERRAL" | "PARTNER_RECRUITMENT";
  url: string;
  /** PNG data URL of the QR code (rendered on the server from SalesChain's QR payload), or null. */
  qrImage: string | null;
};

const TEXT = {
  CUSTOMER_REFERRAL: {
    title: "Kundenanfragen",
    body: "Teilen Sie diesen Link mit Interessenten, die eine Beratung zu einem Fertighaus wünschen. Anfragen darüber werden Ihnen zugeordnet.",
    field: "Empfehlungslink",
    qrAlt: "QR-Code Ihres Empfehlungslinks",
    file: "fertig-haus-empfehlungslink-qr.png",
  },
  PARTNER_RECRUITMENT: {
    title: "Partnerbewerbungen",
    body: "Kennen Sie jemanden, der selbst Partner werden möchte? Mit diesem Link kann sich die Person bewerben.",
    field: "Bewerbungslink",
    qrAlt: "QR-Code Ihres Bewerbungslinks",
    file: "fertig-haus-bewerbungslink-qr.png",
  },
} as const;

/**
 * The signed-in Partner's own links, exactly as SalesChain issued them (see
 * lib/saleschain/client.ts#getOwnReferralLinks and docs/architecture.md,
 * "Partner referral links"). `links === null` means they could not be loaded
 * right now; an empty list means none is active. Nothing is ever derived or
 * invented here.
 */
export function ReferralLinkCard({ links }: { links: PortalReferralLink[] | null }) {
  if (links === null)
    return (
      <Card>
        <EmptyState
          title="Links derzeit nicht verfügbar"
          description="Ihre Links konnten gerade nicht geladen werden. Bitte laden Sie die Seite später erneut."
        />
      </Card>
    );
  if (links.length === 0)
    return (
      <Card>
        <p className="text-sm font-medium text-charcoal-900">Ihr Empfehlungslink</p>
        <div className="mt-4">
          <EmptyState
            title="Noch kein Empfehlungslink"
            description="Ihr persönlicher Empfehlungslink wird nach der Zuordnung zum Partnerprogramm hier bereitgestellt."
          />
        </div>
      </Card>
    );
  return (
    <div className="flex flex-col gap-6">
      {links.map((link) => {
        const text = TEXT[link.purpose];
        return (
          <Card key={link.url}>
            <section aria-label={text.title} className="flex flex-col gap-4">
              <h3 className="font-semibold text-xl text-charcoal-900">{text.title}</h3>
              <p className="text-sm leading-relaxed text-charcoal-500">{text.body}</p>
              <label className="flex flex-col gap-1">
                <span className="sr-only">{text.field}</span>
                <input
                  readOnly
                  value={link.url}
                  className="w-full rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-charcoal-900"
                />
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <CopyLinkButton value={link.url} label={`${text.field} kopieren`} />
                {link.qrImage && (
                  <a
                    href={link.qrImage}
                    download={text.file}
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-olive-700 px-4 py-2 text-sm font-semibold text-olive-700 transition-colors duration-150 hover:bg-olive-700 hover:text-white"
                  >
                    QR-Code herunterladen
                  </a>
                )}
              </div>
              {link.qrImage && (
                // eslint-disable-next-line @next/next/no-img-element -- a server-rendered data URL, not an optimisable asset
                <img src={link.qrImage} alt={text.qrAlt} width={176} height={176} className="rounded-md border border-stone-200" />
              )}
              {link.purpose === "PARTNER_RECRUITMENT" && (
                <p className="text-sm font-semibold text-olive-700">
                  Für die Gewinnung von Partnern entsteht keine Provision.
                </p>
              )}
            </section>
          </Card>
        );
      })}
    </div>
  );
}
