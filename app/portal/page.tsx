import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { checkPartnerSession } from "@/lib/saleschain/client";
import { getPartnerSessionToken } from "@/lib/saleschain/session-cookie";
import { Section } from "@/components/ui/Section";
import { PortalNav } from "@/components/portal/PortalNav";
import { LogoutButton } from "@/components/portal/LogoutButton";
import { ReferralLinkCard } from "@/components/portal/ReferralLinkCard";

// robots directives are inherited from app/layout.tsx's root metadata
// (the whole site is non-indexed) — no need to repeat them here.
export const metadata: Metadata = {
  title: "Partnerportal",
};

export const dynamic = "force-dynamic";

/**
 * Protected Partner dashboard (DNL1-63).
 *
 * Real server-side authorization, not a cookie-shape check: the HttpOnly
 * `partner_session` cookie is forwarded, server-to-server, as a bearer
 * token to SalesChain's `GET /v1/partner-sessions/me`
 * (`lib/saleschain/client.ts#checkPartnerSession`) — the non-destructive
 * counterpart to logout, which would otherwise consume the very session
 * being checked. Every failure mode collapses to the same outcome: no
 * cookie, a malformed cookie, an upstream rejection, a malformed upstream
 * response, a timeout, or a network error all redirect to `/einladung`
 * before any dashboard markup, layout, or navigation renders. Cookie
 * presence or shape alone is never treated as authorization — see
 * docs/architecture.md, "Protected Partner dashboard".
 *
 * A cookie that is present but no longer valid upstream is not proactively
 * cleared here: Next.js only allows `cookies().set()` from a Server Action
 * or Route Handler, never from a plain page render. This has no security
 * consequence — the cookie is re-validated against SalesChain on every
 * visit, so a stale value can never grant access — it is only cleared
 * later by logout or its own 8-hour expiry.
 */
export default async function PortalPage() {
  const cookieStore = await cookies();
  const partnerSessionToken = getPartnerSessionToken(cookieStore);

  // `checkPartnerSession` never throws by its own contract — every failure
  // mode already resolves to `false` — but this call is the entire
  // authorization boundary for this page, so it is wrapped anyway as
  // defense in depth: any unexpected exception here must fail closed
  // (redirect), never surface as an unhandled error that could render
  // default error-page markup instead of a clean redirect.
  let authenticated = false;
  if (partnerSessionToken !== undefined) {
    try {
      authenticated = await checkPartnerSession({ partnerSessionToken });
    } catch {
      authenticated = false;
    }
  }

  if (!authenticated) {
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
