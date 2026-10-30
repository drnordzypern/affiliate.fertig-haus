import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MESSAGES, Notice } from "@/components/public/journey-ui";
import { Section, SectionHeading } from "@/components/ui/Section";
import { customerReferralHandoff } from "@/lib/public-journeys/handlers";
import { referralTracking } from "@/lib/public-journeys/page-params";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Weiterleitung zu fertig-haus.net",
  description: "Ihr persönlicher Link führt Sie weiter zu fertig-haus.net.",
};

/**
 * A Partner's personal customer link or QR (/r/<code>[?qr=..&v=..&utm_*]).
 *
 * This host does not show houses, offers, a configurator or an enquiry form:
 * browsing and the enquiry belong on the customer site. The page records the
 * visit through SalesChain's attribution session and sends the visitor on to
 * the customer site with that session's reference (see lib/public-journeys/
 * handoff.ts). It never shows who referred the visitor and never creates a
 * lead. Closed unless AFFILIATE_CUSTOMER_SITE_URL names a valid destination.
 * Existing /r/<code> URLs and printed QR codes keep working unchanged.
 */
export default async function ReferralPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { code } = await params;
  const handoff = await customerReferralHandoff(code, referralTracking(await searchParams));
  if (handoff.status === "REDIRECT") redirect(handoff.url);
  return (
    <Section className="pt-16 pb-24 sm:pt-20">
      <div className="flex flex-col gap-10">
        <SectionHeading
          level="h1"
          eyebrow="Fertig Haus"
          title="Weiterleitung zu fertig-haus.net"
          description="Ihr persönlicher Link führt Sie weiter zu fertig-haus.net."
        />
        <Notice tone="warning">
          {handoff.status === "LINK_UNAVAILABLE"
            ? MESSAGES.linkUnavailable
            : handoff.status === "SERVICE_UNAVAILABLE"
              ? MESSAGES.serviceUnavailable
              : MESSAGES.off}
        </Notice>
      </div>
    </Section>
  );
}
