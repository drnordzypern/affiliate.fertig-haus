import type { Metadata } from "next";
import { ReferralForm } from "@/components/public/ReferralForm";
import { Section, SectionHeading } from "@/components/ui/Section";
import { customerReferralsEnabled } from "@/lib/public-journeys/config";
import { referralTracking } from "@/lib/public-journeys/page-params";

export const metadata: Metadata = {
  title: "Interesse anmelden",
  description: "Interesse an einem Fertig Haus anmelden.",
};

/**
 * Customer interest registration after a partner's personal link or QR
 * (/r/<code>[?qr=..&v=..&utm_*]). Creates a lead credited to that partner via
 * SalesChain's attribution session, never a partner application, and never
 * shows who referred the visitor. Closed unless
 * AFFILIATE_CUSTOMER_REFERRALS_ENABLED is exactly "true".
 */
export default async function ReferralPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { code } = await params;
  const tracking = referralTracking(await searchParams);
  return (
    <Section className="pt-16 pb-24 sm:pt-20">
      <div className="flex flex-col gap-10">
        <SectionHeading
          level="h1"
          eyebrow="Fertig Haus"
          title="Interesse anmelden"
          description="Hinterlassen Sie Ihre Kontaktdaten, wenn Sie sich für ein Fertig Haus interessieren."
        />
        <ReferralForm code={code} tracking={tracking} enabled={customerReferralsEnabled()} />
      </div>
    </Section>
  );
}