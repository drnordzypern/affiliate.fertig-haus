import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Section } from "@/components/ui/Section";
import { getPartnerSessionToken } from "@/lib/saleschain/session-cookie";
import { PortalNav } from "@/components/portal/PortalNav";
import { LogoutButton } from "@/components/portal/LogoutButton";
import { ReferralLinkCard } from "@/components/portal/ReferralLinkCard";

export const metadata: Metadata = {
  title: "Partnerportal",
  description: "Geschützter Bereich für angenommene Fertig Haus Vertriebspartner.",
};

export const dynamic = "force-dynamic";

/**
 * Protected Partner dashboard.
 *
 * The gate below only checks whether a well-formed `partner_session` cookie
 * is present — it redirects to /einladung when it is absent, so a browser
 * with no session at all never reaches this page. This is deliberately NOT
 * treated as proof of a live, authenticated SalesChain session: SalesChain
 * has no `whoami` endpoint (see docs/architecture.md, "Known limitation"),
 * and the only bearer-authenticated SalesChain call this app can make is
 * logout, which consumes the session — it cannot double as a non-destructive
 * validity check. Nothing rendered below treats cookie presence as an
 * authentication guarantee, and no real Partner/referral/commission data is
 * shown anywhere on this page.
 */
export default async function PortalPage() {
  const cookieStore = await cookies();
  const partnerSessionToken = getPartnerSessionToken(cookieStore);

  if (!partnerSessionToken) {
    redirect("/einladung");
  }

  return (
    <Section className="pt-16 pb-24 sm:pt-20">
      <div className="flex flex-col gap-3">
        <h1 className="font-serif text-3xl text-charcoal-900 sm:text-4xl">
          Partnerportal
        </h1>
        <p className="max-w-2xl text-base leading-relaxed text-charcoal-500">
          Willkommen in Ihrem Partnerportal. Weitere Bereiche werden
          fortlaufend freigeschaltet.
        </p>
      </div>

      <div className="mt-6">
        <LogoutButton />
      </div>

      <div className="mt-12 flex flex-col gap-10 sm:flex-row">
        <PortalNav />

        <div className="flex flex-1 flex-col gap-12">
          <section id="uebersicht" aria-labelledby="uebersicht-heading">
            <h2
              id="uebersicht-heading"
              className="font-serif text-2xl text-charcoal-900"
            >
              Übersicht
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-charcoal-500">
              Ihr Empfehlungslink ist der zentrale Ausgangspunkt für neue
              Empfehlungen. Sobald er verfügbar ist, finden Sie ihn hier.
            </p>
          </section>

          <section id="empfehlungslink" aria-labelledby="empfehlungslink-heading">
            <h2
              id="empfehlungslink-heading"
              className="font-serif text-2xl text-charcoal-900"
            >
              Empfehlungslink
            </h2>
            <div className="mt-6">
              <ReferralLinkCard />
            </div>
          </section>
        </div>
      </div>
    </Section>
  );
}
