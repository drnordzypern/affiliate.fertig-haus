import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * SalesChain has no authenticated endpoint that returns a Partner's
 * referral URL today (see docs/architecture.md, "Known limitation"), and no
 * Affiliate-side configuration can substitute for it — a referral URL is
 * inherently per-Partner data that only SalesChain can issue. This card
 * therefore only ever renders the honest empty state below; it must never
 * be given a fabricated or derived URL. Once a real endpoint exists, this
 * component is where the referral link and its QR code would be added.
 */
export function ReferralLinkCard() {
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
}
