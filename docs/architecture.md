# Architecture boundary

This document defines what this repository is, what it is not, and the
integration boundary the SalesChain integration must respect.

## What this repository is

`affiliate.fertig-haus` is the **public Partner-facing frontend** for the
future Fertig Haus Partner Portal, served from
`https://affiliate.fertig-haus.net`. It is a Next.js (App Router)
application. It also hosts a **same-origin Backend for Frontend (BFF)** —
server-side Route Handlers that mediate between the browser and
SalesChain.

## What this repository is not

- It is **not** the source of truth for Partner data. `saleschain-os` is.
- It does **not** implement Partner application logic, invitation issuance,
  referral/QR attribution, lead handling, commission calculation, Partner
  verification, or audit/compliance logic. All of that lives in
  `saleschain-os`. This repository's only involvement in
  authentication is the narrow, already-approved invitation-acceptance and
  Partner-session boundary described below.
- It does **not** contain a database, cache, or persistence layer. No
  database belongs in this repository at this stage, and none is planned
  for the frontend itself — persistence remains SalesChain's
  responsibility. The one exception, by necessity, is the browser's own
  HttpOnly session cookie (see below), which this app sets but never reads
  the contents of anywhere except to forward it as a bearer token.

## Integration path (implemented)

```text
Browser
→ affiliate.fertig-haus same-origin BFF
→ SalesChain public/API boundary
→ SalesChain database and business logic
```

The browser talks only to this app's own origin. The BFF
(`app/api/partner-invitations/accept`, `app/api/partner-sessions/logout`,
backed by `lib/saleschain/client.ts`) is the only thing allowed to call
SalesChain. The browser never calls SalesChain directly, and no SalesChain
token ever reaches browser JavaScript.

## Approved SalesChain contract

Three endpoints, all already reviewed and merged upstream:

- `POST /v1/public/partner-invitations/accept` — accepts
  `{ invitationToken, turnstileToken }`, returns
  exactly `{ status: "ACCEPTED", loginBootstrapToken }`. A missing,
  malformed, or extra field is a contract failure.
- `POST /v1/public/partner-sessions/bootstrap` — accepts
  `{ loginBootstrapToken }`, returns `{ partnerSessionToken }`.
- `POST /v1/partner-sessions/logout` — `Authorization: Bearer <token>`,
  returns `{ status: "LOGGED_OUT" }`.

All three tokens are 43-character base64url strings. None of these public
endpoints define a shared secret for the BFF to authenticate itself with,
so this repository does not have or need one — see `.env.example`, which
only declares `SALESCHAIN_API_BASE_URL` (server-only) and
`NEXT_PUBLIC_TURNSTILE_SITE_KEY` (intentionally public).

SalesChain has **no `whoami` endpoint and no Partner dashboard-data
endpoint today.** This repository does not invent either. See "Known
limitation" below.

## Security rules for the integration

- **SalesChain tokens are server-only.** The invitation token, the
  bootstrap token, and the Partner session token are only ever read or
  used in server-side code (`lib/saleschain/client.ts`, the two Route
  Handlers under `app/api/`) or, for the invitation token, briefly in
  memory in the browser between reading the URL fragment and submitting
  it once to the BFF. None of them are ever logged, returned in a BFF
  response body, or exposed to a `NEXT_PUBLIC_*` variable.
- **Raw invitation tokens never enter query strings, logs, analytics, or
  browser persistence.** Invitation links use the URL fragment
  (`/einladung#token=...`), which is never sent to the server on the
  initial request. Invitation links carry the token in URL fragments,
  never a query string. `components/invitation/InvitationAcceptShell.tsx` reads
  the fragment client-side and immediately scrubs it via
  `history.replaceState`, before any other script can read it. The token
  lives only in a `useRef` — never in `localStorage`, `sessionStorage`, a
  cookie, or logged output.
- **The bootstrap token and the Partner session token never reach the
  browser.** `app/api/partner-invitations/accept` redeems the bootstrap
  token server-to-server and returns only `{ status: "AUTHENTICATED" }`.
  The Partner session token is stored solely in a `HttpOnly` cookie (see
  `lib/saleschain/session-cookie.ts`) that client JavaScript cannot read.
- **Errors are generic.** Neither BFF route reveals whether an invitation
  exists, is expired/consumed/revoked, or why bootstrap/session
  establishment failed. See the Route Handlers for the exact
  400/404/502/503 mapping.

## Known limitation: no live session validation

Because SalesChain does not yet expose a `whoami` or Partner-resource
endpoint, **this repository cannot and does not validate that the Partner
session cookie is still live.** The Partner-session cookie is set once,
after a successful bootstrap redemption, and is otherwise only read to:

- forward it as the `Authorization: Bearer` header to
  `app/api/partner-sessions/logout`, and
- gate `app/portal/page.tsx` (see "Protected Partner dashboard" below).

**Cookie presence is not, and must never be treated as, proof of a live,
authenticated SalesChain session.** Every future request for real Partner
data (referrals, commissions, profile) must independently authorize itself
against SalesChain using this bearer token; it cannot rely on the cookie
merely existing. Note also that the *only* bearer-authenticated SalesChain
call this repository can make is `POST /v1/partner-sessions/logout`, which
consumes the session — it cannot double as a non-destructive validity
check. A future `whoami` or Partner-resource endpoint on SalesChain is
required before any authoritative session introspection can be implemented
here.

## Protected Partner dashboard: blocked (DNL1-63)

`app/portal/page.tsx` **unconditionally redirects to `/einladung`** and
renders no dashboard content at all. It does not read the
`partner_session` cookie, and it does not branch on cookie presence,
shape, User-Agent, or request type.

An earlier revision of this page gated the dashboard on cookie
*presence/shape* only (`getPartnerSessionToken` returning a
well-formed-looking token) and rendered the dashboard whenever that check
passed. Per the mandatory private-application boundary in Jira `DNL1-63`,
that was a release-blocking defect, not an acceptable interim state: a
well-formed cookie shape is not server-side Partner authorization — any
caller can send an arbitrary 43-character base64url value as the
`partner_session` cookie without ever completing the invitation/bootstrap
flow, and the previous implementation rendered the dashboard for exactly
that forged input (proven live; see "DNL1-63 adversarial verification"
below). "Dashboard pages and layouts" are private application surface
under DNL1-63's route classification and must require real server-side
Partner authorization before any content is delivered — not merely a
plausible cookie shape.

Because SalesChain exposes no non-destructive, bearer-authenticated way to
verify a session token (see "Known limitation" above — the only such call
is the destructive `logout`), there is currently no way to implement that
real authorization in this repository. Rendering the dashboard is
therefore disabled until SalesChain provides one. `components/portal/
PortalNav.tsx`, `components/portal/ReferralLinkCard.tsx`,
`components/portal/LogoutButton.tsx`, and `lib/portal-sections.ts` remain
in the codebase, already built and tested, ready to be wired back into
`/portal` behind a real check the moment that endpoint exists — none of
them are currently imported by any route.

## Known limitation: no referral/QR data source

SalesChain's bootstrap-redemption response is exactly
`{ partnerSessionToken }` (see "Approved SalesChain contract" above) — no
partner id, referral code, or profile data — and the only bearer-
authenticated endpoint (`POST /v1/partner-sessions/logout`) returns only
`{ status }`. There is therefore no existing, authenticated SalesChain
endpoint this repository can call to obtain a Partner's referral URL, and
no Affiliate-side configuration can substitute for it, since a referral URL
is inherently per-Partner data only SalesChain can issue.
`components/portal/ReferralLinkCard.tsx` therefore renders only an honest
empty state and no QR code is generated (there is nothing to encode). A
future bearer-authenticated SalesChain read endpoint — for example
`GET /v1/partner-sessions/me` or an equivalent Partner-resource contract
returning at least a referral URL/code — is required before this
repository can implement a real referral link or QR code.

## CSRF / same-origin protection

`lib/security/same-origin.ts#isSameOriginRequest` is the CSRF defense for
this repository's state-changing BFF routes (`app/api/partner-invitations/
accept`, `app/api/partner-sessions/logout`). Both routes reject any request
whose `Origin` header is missing or does not match the request's own
resolved URL origin, with a generic `403 { status: "FORBIDDEN" }`, before
any other processing (including cookie reads or SalesChain calls). This
needs no configured allow-list: every modern browser attaches `Origin` to
same-origin, non-GET/HEAD `fetch()` requests, not only cross-origin ones,
so comparing it against the request's own URL is sufficient and portable
across deployment hosts.

## DNL1-63: route classification and adversarial verification

Route classification (per Jira `DNL1-63`'s private-application boundary —
minimum unauthenticated surface only, everything else must require real
server-side Partner authorization before content delivery):

| Route | Classification | Enforcement |
| --- | --- | --- |
| `/`, `/so-funktioniert-es` | Public marketing | none needed — no private content exists |
| `/partner-werden` | Public, non-functional preview form | none needed — submission disabled, no private content |
| `/einladung`, `/partner/invitation/accept` | Public invitation-acceptance entry — minimum surface required to begin authentication | none needed — no Partner/dashboard data rendered; invitation token lives only in the URL fragment and a `useRef`, never reaches the server on the initial request |
| `POST /api/partner-invitations/accept` | Public, minimum BFF endpoint required to submit invitation acceptance/bootstrap authentication | same-origin check (403 on failure); strict input validation; generic error responses; bootstrap/session tokens never returned to the browser |
| `POST /api/partner-sessions/logout` | Public, idempotent control action — exposes no private content to any caller regardless of session validity | same-origin check (403 on failure); always returns the identical generic `{status:"LOGGED_OUT"}` |
| `/portal` | Would-be protected dashboard | **BLOCKED**: unconditional `redirect("/einladung")` before any markup renders, for every request — see "Protected Partner dashboard: blocked" above |
| `/robots.txt` | Framework asset, no confidential content | n/a |
| any other/unknown path | Not a route in this app | Next.js's own 404 handling; nothing here renders unknown paths |

No image, QR export, document, PDF, media, or download route exists in
this repository at all — there is nothing in that category to classify or
protect yet, and none should be added until it can be served behind real
authorization.

Adversarial verification performed against a production build
(`next build && next start`), per DNL1-63's required acceptance tests:

| # | Test | Result |
| --- | --- | --- |
| 1–2 | Anonymous `GET /portal`, no cookie | `307` to `/einladung`; body contains the site shell only, no dashboard strings (`Empfehlungslink`, `Bald verfügbar`, etc.) |
| 3 | Direct `POST` to both BFF routes with no/foreign `Origin` | `403 {"status":"FORBIDDEN"}`, no upstream call made |
| 4 | RSC/Flight-shaped `GET /portal` (`RSC: 1`, `_rsc` query, forged cookie) | No dashboard content in the flight payload; the embedded digest resolves to `NEXT_REDIRECT;replace;/einladung;307` |
| 5–7 | Googlebot, `GPTBot`, `facebookexternalhit`, `ClaudeBot` User-Agents on `/portal` | Identical `307` redirect and headers as an anonymous request — no UA-based branching exists anywhere, so there is no bypass surface tied to User-Agent |
| 8 | Direct protected image/file/QR/download URL | N/A — no such route exists in this repository |
| 9 | Sitemap/feed/structured data exposing private URLs | `/sitemap.xml` and `/feed.xml` both `404`; none are declared |
| 10 | Public HTML on `/`, `/einladung` scanned for SalesChain/session/token strings | None found |
| 11 | `Cache-Control` on private responses | `private, no-store` on `/portal`, `POST /api/partner-invitations/accept`, `POST /api/partner-sessions/logout` |
| 12 | Indexing headers/metadata | `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet, noimageindex` on every route (`next.config.ts`); `<meta name="robots">`/`<meta name="googlebot">` on every page (`app/layout.tsx`); `robots.txt` disallows `/` entirely |
| 13 | Cookie tampering (well-formed but forged `partner_session`) | Still redirects — the route no longer reads the cookie at all, so no shape of cookie can pass |
| 14 | Logout then re-request `/portal` (simulating browser-back/deep-link after logout) | Cookie cleared with `Set-Cookie: ...; Max-Age=0; Secure; HttpOnly`; subsequent `/portal` request still `307`s regardless |
| 15 | Knowing/guessing the `/portal` URL | Insufficient — every request redirects unconditionally; there is no cookie value or header that reaches dashboard content |

One known, accepted gap: on a plain (non-RSC) browser navigation request,
Next.js's own internal `Vary` header for the redirect response
(`rsc, next-router-state-tree, next-router-prefetch, ...`) supersedes the
custom `Vary: Cookie` rule in `next.config.ts` — confirmed present on
RSC/Flight-shaped requests, but not on the initial full-page redirect.
`Cache-Control: private, no-store` is present on both request shapes and
already prevents shared/proxy caching regardless of `Vary`, so this does
not reopen the boundary; it is noted here for completeness rather than
left silently unverified.

## Residual partial-failure limitation

After bootstrap redemption, the Affiliate BFF uses the newly issued session
token to make one best-effort server-side logout call if it detects a local
failure before returning success (including cookie mutation failure or an
already-aborted request). It also attempts to clear any locally mutated
cookie. Compensation never retries and never replaces the original generic
failure response.

This is not a distributed transaction. A disconnect after the final abort
check, failure to deliver the completed HTTP response, or failure of the
one compensation logout can still leave a SalesChain session orphaned until
SalesChain expires it. The Affiliate service cannot guarantee stronger
cleanup without an upstream transactional or idempotent session contract.

## Current state of each integration point

| Area | Current state |
| --- | --- |
| Partner application (`/partner-werden`) | Static preview UI only. Submit action is disabled. No API call. |
| Invitation acceptance (`/einladung`; legacy alias `/partner/invitation/accept`) | Implemented. Reads the URL fragment, scrubs it, runs Turnstile, submits to the BFF. New invitation links use `/einladung#token=...`. |
| Partner portal (`/portal`) | **Blocked (DNL1-63):** unconditionally redirects to `/einladung`; no dashboard renders for anyone. See "Protected Partner dashboard: blocked" above. |
| BFF routes | Implemented: `app/api/partner-invitations/accept`, `app/api/partner-sessions/logout`. Both reject cross-origin requests (see "CSRF / same-origin protection") and set `Cache-Control: private, no-store` / `X-Robots-Tag: noindex...`. |
| SalesChain client | Implemented: `lib/saleschain/client.ts`, `lib/saleschain/config.ts`, `lib/saleschain/session-cookie.ts`. |

## Environment variables

See [`.env.example`](../.env.example) for the names of environment
variables this integration needs. It contains names only — no values, no
credentials. Do not commit a `.env` file with real values.
