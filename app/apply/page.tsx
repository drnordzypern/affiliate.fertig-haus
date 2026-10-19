import type { Metadata } from "next";
import { ApplicationForm } from "@/components/public/ApplicationForm";
import { Section, SectionHeading } from "@/components/ui/Section";
import { partnerApplicationsEnabled } from "@/lib/public-journeys/config";
import { qrTracking } from "@/lib/public-journeys/page-params";

export const metadata: Metadata = {
  title: "Partnerbewerbung",
  description: "Bewerbung als Fertig Haus Partner. Ihre Bewerbung wird geprüft.",
};

/**
 * Direct, sponsor-free partner application. Separate from the customer-referral
 * journey (/r/<code>): it creates an application in review and nothing else.
 * Closed unless AFFILIATE_PARTNER_APPLICATIONS_ENABLED is exactly "true".
 */
export default async function ApplyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tracking = qrTracking(await searchParams);
  return (
    <Section className="pt-16 pb-24 sm:pt-20">
      <div className="flex flex-col gap-10">
        <SectionHeading
          level="h1"
          eyebrow="Partner werden"
          title="Bewerbung als Partner"
          description="Bewerben Sie sich für das Fertig Haus Partnerprogramm. Ihre Bewerbung wird geprüft."
        />
        <ApplicationForm variant="direct" tracking={tracking} enabled={partnerApplicationsEnabled()} />
      </div>
    </Section>
  );
}