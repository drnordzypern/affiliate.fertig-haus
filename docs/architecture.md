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

Four endpoints, all already reviewed and merged upstream:

- `POST /v1/public/partner-invitations/accept` — accepts
  `{ invitationToken, turnstileToken }`, returns
  exactly `{ status: "ACCEPTED", loginBootstrapToken }`. A missing,
  malformed, or extra field is a contract failure.
- `POST /v1/public/partner-sessions/bootstrap` — accepts
  `{ loginBootstrapToken }`, returns `{ partnerSessionToken }`.
- `POST /v1/partner-sessions/logout` — `Authorization: Bearer <token>`,
  returns `{ status: "LOGGED_OUT" }`. Consumes/revokes the session.
- `GET /v1/partner-sessions/me` — `Authorization: Bearer <token>`,
  returns exactly `{ status: "AUTHENTICATED" }` on success. The
  **non-destructive** counterpart to logout (`saleschain-os` PR #45):
  resolves the bearer token against the live `PartnerSession` row and its
  Partner/Membership/User state — rejecting malformed, unknown, expired,
  revoked, cross-tenant, inactive, or internal-demo identities, all as a
  uniform generic `401` — without consuming, refreshing, or mutating
  anything, and without any Programme-level authorization. A disabled
  `PARTNER_SESSION_ENABLED` flag yields the same generic `404` as the
  other Partner-session routes. See "Protected Partner dashboard" below
  for how this repository uses it.

All three session/bootstrap tokens are 43-character base64url strings.
None of these public/bearer endpoints define a shared secret for the BFF
to authenticate itself with, so this repository does not have or need
one — see `.env.example`, which only declares `SALESCHAIN_API_BASE_URL`
(server-only) and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (intentionally
public).

SalesChain still has **no Partner dashboard-data endpoint** (referral
URL, profile, commissions, etc.) — only the narrow session-validation
contract above. This repository does not invent one. See "Known
limitation: no referral/QR data source" below.

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

## Known limitation: no Partner dashboard-data endpoint

SalesChain's session-validation endpoint (`GET /v1/partner-sessions/me`,
above) answers only "is this bearer token a live Partner session" — it
returns no email, name, Partner/Membership/Tenant/Programme id, or
referral identifier by design. Every future request for real Partner
business data (referrals, commissions, profile) still needs its own,
separately-approved SalesChain contract; this repository does not invent
one — see "Known limitation: no referral/QR data source" below.

## Protected Partner dashboard

`app/portal/page.tsx` performs real, server-side, non-destructive session
validation before rendering anything: it reads the `partner_session`
cookie (`lib/saleschain/session-cookie.ts#getPartnerSessionToken`, which
already enforces the exact token shape) and, only if a well-formed value
is present, forwards it server-to-server as `Authorization: Bearer
<token>` to SalesChain's `GET /v1/partner-sessions/me`
(`lib/saleschain/client.ts#checkPartnerSession`). The dashboard renders
if and only if that call returns exactly `{ status: "AUTHENTICATED" }`;
every other outcome — no cookie, a malformed cookie, a `401`/`404`/`429`/
`5xx` response, a malformed/extra-field `200` body, a timeout, a network
error, or even an unexpected exception from the check itself — redirects
to `/einladung` before any dashboard markup, layout, or navigation
renders. `checkPartnerSession` never throws (every failure mode already
resolves to `false`), and the page wraps the call in `try/catch` anyway
as defense in depth on this security-critical boundary.

**This closes a real, previously-shipped defect.** An earlier revision of
this page treated cookie *presence/shape* alone as sufficient
(`getPartnerSessionToken` returning a well-formed-looking token) and
rendered the dashboard whenever that check passed — any caller could send
an arbitrary 43-character base64url value as the `partner_session` cookie
without ever completing the invitation/bootstrap flow, and the dashboard
rendered for exactly that forged input (proven live during that
review). A subsequent, intermediate revision closed the hole the only way
possible at the time — an unconditional redirect, since SalesChain then
exposed no non-destructive way to verify a token (`logout` consumes the
very session it would check) — and reported that gap as a backend-contract
blocker. SalesChain's `saleschain-os` PR #45 added exactly the endpoint
that blocker named, closing it.

Because there is no way to invalidate a stale-but-locally-present cookie
from a plain page render (Next.js only allows `cookies().set()` from a
Server Action or Route Handler), an invalid cookie is not proactively
cleared by visiting `/portal` — it has no security consequence, since the
cookie is re-validated against SalesChain on every visit and can never
grant access on its own; it is only cleared by logout or its own 8-hour
expiry.

## Known limitation: no referral/QR data source

SalesChain's bootstrap-redemption response is exactly
`{ partnerSessionToken }`, and `GET /v1/partner-sessions/me` returns
exactly `{ status: "AUTHENTICATED" }` (see "Approved SalesChain contract"
above) — deliberately no partner id, referral code, or profile data from
either. There is therefore still no existing, authenticated SalesChain
endpoint this repository can call to obtain a Partner's referral URL, and
no Affiliate-side configuration can substitute for it, since a referral
URL is inherently per-Partner data only SalesChain can issue.
`components/portal/ReferralLinkCard.tsx` therefore renders only an honest
empty state and no QR code is generated (there is nothing to encode). A
future Partner-resource contract returning at least a referral URL/code —
separate from, and in addition to, the session-validation contract above
— is required before this repository can implement a real referral link
or QR code.

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
| `/portal` | Protected Partner dashboard | Real server-side authorization via SalesChain `GET /v1/partner-sessions/me` before any markup renders; `redirect("/einladung")` on any non-`AUTHENTICATED` outcome — see "Protected Partner dashboard" above |
| `/robots.txt` | Framework asset, no confidential content | n/a |
| any other/unknown path | Not a route in this app | Next.js's own 404 handling; nothing here renders unknown paths |

No image, QR export, document, PDF, media, or download route exists in
this repository at all — there is nothing in that category to classify or
protect yet, and none should be added until it can be served behind real
authorization.

Adversarial verification, per DNL1-63's required acceptance tests, was
performed in two passes:

- **Header/indexing/CSRF hardening** (items 5–7, 9, 11–12, unchanged by
  the session-validation work below): verified against a full production
  build (`next build && next start`).
- **Session-validation logic** (items 1–4, 13–15, added by wiring the real
  `/me` check): verified against `next dev` with a local mock HTTP
  upstream standing in for SalesChain (`SALESCHAIN_API_BASE_URL` pointed
  at `http://localhost:<mock-port>` — `getSalesChainBaseUrl()` only
  permits a non-`https` origin outside Production, so a true `next start`
  run needs a locally-trusted TLS cert to test against a mock upstream;
  the request-handling logic under test is identical in both modes and is
  additionally covered by `__tests__/portal.test.tsx` and
  `__tests__/saleschain-client.test.ts` at the unit level). No real
  SalesChain credential or Production system was used for any of this.

| # | Test | Result |
| --- | --- | --- |
| 1 | No cookie at all | `307` to `/einladung`; `checkPartnerSession` never called |
| 2 | Malformed cookie (wrong shape/length) | `307` to `/einladung`; `checkPartnerSession` never called |
| 3 | Well-formed but fabricated cookie, mock backend `401` | `307` to `/einladung` |
| 3b | Well-formed cookie the mock backend confirms live (`200 {"status":"AUTHENTICATED"}`) | `200`, real dashboard renders (`Empfehlungslink` present) |
| 4 (fail-closed) | Mock backend `200` with extra fields | `307` — extra-field response rejected, not trusted |
| 4 (fail-closed) | Mock backend `500` | `307` |
| 4 (fail-closed) | Mock backend never responds (timeout) | `307`, after the fixed 8s client timeout |
| 4 (fail-closed) | Mock backend unreachable (connection refused) | `307` |
| 4 | RSC/Flight-shaped `GET /portal` (`RSC: 1`, `_rsc` query) with a fabricated cookie | No dashboard content in the flight payload; digest resolves to `NEXT_REDIRECT;replace;/einladung;307` |
| 4 | RSC/Flight-shaped `GET /portal` with a mock-confirmed valid cookie | Dashboard content (`Empfehlungslink`) present in the flight payload — the RSC path re-executes the same authorization, it is not bypassed |
| 5–7 | Googlebot, `GPTBot`, `facebookexternalhit`, `ClaudeBot` User-Agents on `/portal` with a fabricated cookie | `307` for every UA — no UA-based branching exists anywhere |
| 8 | Direct protected image/file/QR/download URL | N/A — no such route exists in this repository |
| 9 | Sitemap/feed/structured data exposing private URLs | `/sitemap.xml` and `/feed.xml` both `404`; none are declared |
| 10 | Public HTML on `/`, `/einladung` scanned for SalesChain/session/token strings | None found |
| 11 | `Cache-Control` on private responses | `private, no-store` on `/portal`, `POST /api/partner-invitations/accept`, `POST /api/partner-sessions/logout` (production build) |
| 12 | Indexing headers/metadata | `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet, noimageindex` on every route (`next.config.ts`); `<meta name="robots">`/`<meta name="googlebot">` on every page (`app/layout.tsx`); `robots.txt` disallows `/` entirely (production build) |
| 12 | `POST /api/partner-invitations/accept` with no `Origin` header | `403 {"status":"FORBIDDEN"}`, no upstream call made |
| 13 | Cookie tampering (well-formed but forged `partner_session`) | `307` — the backend call rejects it; cookie shape alone is never sufficient |
| 14 | Real logout (same-origin, mock-confirmed valid cookie), then re-request `/portal` with no cookie | Cookie cleared with `Set-Cookie: ...; Max-Age=0; HttpOnly; SameSite=lax`; subsequent `/portal` request `307`s |
| 15 | Knowing/guessing the `/portal` URL | Insufficient on its own — a real, currently-live SalesChain-confirmed session is required in every case above |

One known, accepted gap, carried over from the header-hardening pass and
unaffected by this round: on a plain (non-RSC) browser navigation request,
Next.js's own internal `Vary` header for the redirect response
(`rsc, next-router-state-tree, next-router-prefetch, ...`) supersedes the
custom `Vary: Cookie` rule in `next.config.ts` — confirmed present on
RSC/Flight-shaped requests, but not on the initial full-page redirect.
`Cache-Control: private, no-store` is present on both request shapes and
already prevents shared/proxy caching regardless of `Vary`, so this does
not reopen the boundary.

## Pre-launch site access boundary

The entire Affiliate application is temporarily private: every page,
every BFF/API route, and every RSC/Flight or framework data request
requires a shared pre-launch password before any of it is delivered. This
is unrelated to Partner authentication — it exists only because the
complete SalesChain experience has not yet been approved for public
launch — and it sits in front of everything else in this document,
including the invitation flow and the DNL1-63 protections above.

### Architecture

`proxy.ts` (Next.js 16's Proxy — the renamed, Node.js-runtime-by-default
successor to `middleware.ts`; see its own doc comment and
`node_modules/next/dist/docs/.../proxy.md`) runs before any route is
rendered:

1. Reads the signed `af_access` cookie and verifies it
   (`lib/site-access/cookie.ts`) against `AFFILIATE_SITE_ACCESS_SECRET`.
2. If valid and unexpired, calls `NextResponse.next()` — the request
   proceeds to the real app exactly as before, with nothing added.
3. If invalid, absent, or configuration itself is unusable, it responds
   **directly** — a hand-written HTML string
   (`lib/site-access/page.ts`), never a Next.js page/layout render — for
   page-shaped requests, or a generic JSON `401` for anything under
   `/api/`. Neither path ever touches, imports, or renders any part of
   the real application.

Because this is a direct in-proxy response rather than a redirect, the
browser's address bar never changes: whatever URL was requested — a
protected page, an unknown path, or `/einladung#token=...` — is the URL
the gate is served at and the URL that gets reloaded on success. This is
also why invitation fragments are safe by construction: a fragment is
never sent to any server by the browser regardless of this boundary, and
because there is no redirect, the browser's own already-displayed
fragment is never touched, dropped, or exposed to it either.

### Route classification

| Route | Behavior without the access cookie |
| --- | --- |
| `/robots.txt` | Public — excluded from the proxy `matcher` entirely; unaffected |
| `/_next/static/*`, `/_next/image` | Excluded from the `matcher` (Next's own recommended pattern) — generic, non-per-request build output remains fetchable by URL; see "Honest limitations" below |
| Every other path — `/`, `/partner-werden`, `/so-funktioniert-es`, `/einladung`, `/partner/invitation/accept`, `/portal`, any unknown/deep link | Neutral gate HTML, `401` (or `503` if configuration itself is invalid) |
| Every `/api/*` route (`accept`, `logout`, `site-access/lock`) | Generic `{"status":"UNAUTHORIZED"}` JSON, `401` — never the HTML gate, and a `POST` body here is never interpreted as a password attempt |

### Fail-closed configuration

`lib/site-access/config.ts#getSiteAccessConfig()` returns `null` — never
a fallback value — unless both `AFFILIATE_SITE_ACCESS_PASSWORD` (≥ 8,
≤ 512 chars) and `AFFILIATE_SITE_ACCESS_SECRET` (≥ 32 chars) are present.
`proxy.ts` treats `null` identically to "no correct password could ever
be entered": every request is denied, in every environment, with no
production-only carve-out — a preview/staging deployment with missing
configuration is exactly as exposed as Production would be if this were
environment-gated, so this boundary does not distinguish between them.

### Password verification and the signed cookie

- The submitted form is parsed strictly: `application/x-www-form-urlencoded`
  only, exactly one field (`password`), ≤ 2048 request bytes, ≤ 512
  password characters — extra fields, a duplicated `password` field, a
  different content type, or an oversized body all fail the same generic
  way (`lib/site-access/request.ts`).
- The password is compared with `lib/site-access/password.ts#verifyPassword`:
  both sides are SHA-256-hashed first, then compared with
  `crypto.timingSafeEqual` — constant-time regardless of length or content
  differences.
- Every rejection reason (wrong password, malformed submission, missing
  configuration) renders the same neutral page shape with only a generic
  message — the response never distinguishes which check failed.
- On success, `lib/site-access/cookie.ts#createSiteAccessCookieValue`
  issues `<base64url {v,exp}>.<base64url HMAC-SHA-256 signature>` —
  `HttpOnly`, `Secure` in Production, `SameSite=Lax`, `Path=/`, no
  `Domain` (host-only), `Max-Age` of exactly 4 hours
  (`SITE_ACCESS_MAX_AGE_SECONDS`). The payload carries no password, no
  Partner/session/invitation data, and no identifier of any kind — only a
  schema version and an expiry. Verification recomputes the signature in
  constant time and independently checks the expiry on every request; a
  forged, altered, or expired value fails exactly like a missing one.
- This cookie is unrelated to, and never substitutes for,
  `lib/saleschain/session-cookie.ts`'s Partner-session cookie.
  Possessing it only means "this browser passed the pre-launch gate" —
  `/portal` still independently requires its own real,
  backend-confirmed SalesChain session check regardless of this cookie's
  state (verified live; see "Adversarial verification" below).
- "Zugang sperren" (`components/site-access/LockAccessButton.tsx`,
  `app/api/site-access/lock/route.ts`) clears only this cookie via a
  same-origin-checked `POST`, then does a full browser navigation home —
  never the Partner-session cookie, never a client-side-only state change.

### Rate limiting — honest limitation

`lib/site-access/rate-limit.ts` bounds repeated wrong-password attempts
per client IP (5 per 5-minute window) using an in-memory `Map`. **This is
not globally durable.** This repository has no database, cache, or other
shared-state layer by design, and none was added solely for this — a
`Map` inside a Vercel serverless/edge function instance is not shared
across other instances, regions, or cold starts, so an attacker
distributing requests widely is not fully stopped by this alone. This is
best-effort defense in depth, not the real control. **Recommendation:**
enable Vercel Firewall or native Deployment Protection (see below) for
durable, infrastructure-level rate limiting and access control.

### Native Vercel protection

Not accessed or changed in this task (explicitly out of scope). For the
record:

1. **Application-level protection (this change):** active in code,
   fail-closed, requires no Vercel configuration beyond the two secrets
   below.
2. **Vercel infrastructure-level protection:** Vercel's own Deployment
   Protection (password or Vercel-authentication protection at the edge,
   ahead of this application entirely) would be a stronger additional
   layer and should be enabled manually after this merges — it protects
   even the static chunks this boundary cannot (see "Honest limitations").
3. **Plan restriction:** whether the current Vercel plan includes
   Deployment Protection was not checked (out of scope) — verify manually
   before relying on it.
4. **Manual post-merge checklist:** add `AFFILIATE_SITE_ACCESS_PASSWORD`
   and `AFFILIATE_SITE_ACCESS_SECRET` to the Vercel project's environment
   variables (Production, and Preview if those should also be gated);
   deploy; verify the gate live; then separately evaluate enabling native
   Deployment Protection.

### Complete isolation from fertig-haus.net

Nothing in this change reads, writes, or references the main
`fertig-haus.net` site, its repository, its Vercel project, its DNS, or
its Search Console/analytics configuration — this repository has no
access to any of them. The `af_access` cookie is host-only (no `Domain`
attribute is ever set, matching the existing `partner_session` cookie's
own convention), so it is scoped to exactly the Affiliate host and is
never sent to, or valid for, any other host including the apex domain,
`www`, or a future subdomain that happens to share a parent zone.

### Honest limitations

- **Static build chunks remain fetchable.** `/_next/static/*` is excluded
  from the proxy `matcher` (Next's own documented recommendation — gating
  it risks breaking the app for authorized visitors). These files are
  generic, hashed, non-per-request framework/build output, not
  per-request application data; this is not claimed to be infrastructure-
  level invisibility, only that no protected *content* is in them.
- **A hostname can still be discovered** via DNS records or
  certificate-transparency logs once a subdomain is connected, regardless
  of this boundary. The security goal here is that no protected content
  or application structure is obtainable without the password — not an
  impossible guarantee that the hostname itself can never be observed to
  exist.
- **`noindex` + this boundary prevent future indexing, not past
  indexing.** `robots.txt` was already restrictive before this change, so
  nothing here should have been crawled; if anything was indexed earlier
  regardless, that requires a manual Google Search Console removal
  request — outside what code can fix.
- **The `Vary: Cookie` gap noted above** (superseded by Next's own
  routing `Vary` on a plain full-page request) applies identically here.

### Adversarial verification

Verified against a production build (`next build && next start`) with
synthetic, test-only credentials (never a real Production value), plus
automated tests in `__tests__/proxy.test.ts` and the `lib/site-access/*`
test files:

| Requirement | Result |
| --- | --- |
| Anonymous `/` returns only the neutral gate | ✅ `401`, body contains no app/brand content |
| `/partner-werden`, `/so-funktioniert-es`, `/einladung`, `/portal` | ✅ all `401`, gate only, no page-specific content |
| Unknown/deep link | ✅ `401`, gate only |
| BFF/API requests (`accept`, `logout`, `site-access/lock`) | ✅ generic `401` JSON, never the HTML gate |
| RSC/Flight-shaped request (`RSC: 1`, `_rsc` query) | ✅ `401`, no dashboard/app content in the body |
| Googlebot, Bingbot, GPTBot, ClaudeBot, `facebookexternalhit` User-Agents | ✅ identical `401` for every one — no UA branching exists anywhere |
| Wrong password | ✅ generic German message, no cookie set |
| Oversized / wrong-content-type / extra-field submission | ✅ generic `400`, no cookie set |
| Correct password | ✅ `200`, exactly one `Set-Cookie`, no plaintext password anywhere in the response |
| Forged cookie (different secret) / tampered cookie / expired cookie | ✅ all fail closed to the gate |
| Missing configuration | ✅ `503` (page) / `401` (API); correct password still cannot succeed |
| "Zugang sperren" | ✅ clears the cookie; the same cookie value is rejected immediately after |
| Site-access cookie alone vs. `/portal` | ✅ verified live: a valid site-access cookie with no real Partner session still gets `307` to `/einladung` — the two boundaries are fully independent |
| Existing DNL1-63/Partner-session behavior | ✅ unchanged — full existing suite (`__tests__/portal.test.tsx`, `saleschain-client.test.ts`, `same-origin.test.ts`, etc.) still passes unmodified |
| Private responses | ✅ `Cache-Control: private, no-store`, `Vary: Cookie`, `X-Robots-Tag`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, CSP on every gate/deny response |
| `robots.txt` / sitemap / feed | ✅ `robots.txt` unaffected; no sitemap/feed route exists (both resolve through the gate) |
| Public HTML/JSON/JS contains no password, secret, or Partner data | ✅ confirmed by direct inspection of every response body in this pass |
| Parent-domain isolation | ✅ no code, cookie, header, redirect, or configuration references `fertig-haus.net`'s apex/root/`www`, or any host other than this app's own |

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
| Partner portal (`/portal`) | Implemented and protected: real server-side validation via SalesChain `GET /v1/partner-sessions/me`, redirects to `/einladung` on any non-`AUTHENTICATED` outcome. No real Partner/lead/commission data; referral link shows an honest empty state. See "Protected Partner dashboard" above. |
| BFF routes | Implemented: `app/api/partner-invitations/accept`, `app/api/partner-sessions/logout`. Both reject cross-origin requests (see "CSRF / same-origin protection") and set `Cache-Control: private, no-store` / `X-Robots-Tag: noindex...`. |
| SalesChain client | Implemented: `lib/saleschain/client.ts` (including `checkPartnerSession`), `lib/saleschain/config.ts`, `lib/saleschain/session-cookie.ts`. |
| Pre-launch site access boundary | Implemented: `proxy.ts`, `lib/site-access/*`. Every route requires a shared password (`AFFILIATE_SITE_ACCESS_PASSWORD`) before any content — including this integration — is reachable. See "Pre-launch site access boundary" above. |

## Environment variables

See [`.env.example`](../.env.example) for the names of environment
variables this integration needs. It contains names only — no values, no
credentials. Do not commit a `.env` file with real values.
