import type { Metadata } from "next";
import { redirect } from "next/navigation";

// robots directives are inherited from app/layout.tsx's root metadata
// (the whole site is non-indexed) — no need to repeat them here.
export const metadata: Metadata = {
  title: "Partnerportal",
};

export const dynamic = "force-dynamic";

/**
 * BLOCKED pending a SalesChain backend contract (Jira DNL1-63).
 *
 * This repository has no way to non-destructively verify that a
 * `partner_session` cookie was actually issued by SalesChain to a real,
 * still-active Partner. The only bearer-authenticated SalesChain call
 * available is `POST /v1/partner-sessions/logout`, which consumes the
 * session and cannot double as a validity check (see
 * docs/architecture.md, "Known limitation: no live session validation").
 *
 * A well-formed cookie *shape* is not authorization: any caller — no
 * browser or invitation required — can send an arbitrary 43-character
 * base64url value as the `partner_session` cookie. An earlier version of
 * this page rendered the dashboard for exactly that reason, which is a
 * release-blocking defect: "dashboard pages and layouts" are private
 * application surface and must require real server-side Partner
 * authorization before any content is delivered, not merely a plausible
 * cookie shape.
 *
 * Until SalesChain exposes a non-destructive, bearer-authenticated
 * session-validation/profile endpoint (e.g. `GET /v1/partner-sessions/me`
 * or an equivalent Partner-resource contract), this route does not read
 * the cookie at all and unconditionally redirects to `/einladung` before
 * rendering any dashboard markup, layout, or navigation — for every
 * request, regardless of cookie presence, shape, User-Agent, or request
 * type (including RSC/Flight data requests, which re-execute this same
 * Server Component server-side and hit the same redirect before anything
 * is rendered).
 */
export default function PortalPage() {
  redirect("/einladung");
}
