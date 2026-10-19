import type { Metadata } from "next";
import { ApplicationForm } from "@/components/public/ApplicationForm";
import { Section, SectionHeading } from "@/components/ui/Section";
import { partnerApplicationsEnabled } from "@/lib/public-journeys/config";
import { qrTracking } from "@/lib/public-journeys/page-params";

export const metadata: Metadata = {
  title: "Partnerbewerbung auf Einladung",
  description: "Bewerbung als Fertig Haus Partner auf persönliche Einladung. Ihre Bewerbung wird geprüft.",
};

/**
 * Partner application through an existing partner's recruitment link or QR
 * (/apply/<code>[?qr=..&v=..]). The page never shows who invited the visitor.
 * A recruitment code never resolves as a customer-referral code and vice versa:
 * SalesChain keeps the two purposes apart, and so do the two BFF route trees.
 */
export default async function ReferredApplyPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { code } = await params;
  const tracking = qrTracking(await searchParams);
  return (
    <Section className="pt-16 pb-24 sm:pt-20">
      <div className="flex flex-col gap-10">
        <SectionHeading
          level="h1"
          eyebrow="Partner werden"
          title="Bewerbung auf Einladung"
          description="Sie wurden eingeladen, sich für das Fertig Haus Partnerprogramm zu bewerben. Ihre Bewerbung wird geprüft."
        />
        <ApplicationForm variant="referred" code={code} tracking={tracking} enabled={partnerApplicationsEnabled()} />
      </div>
    </Section>
  );
}