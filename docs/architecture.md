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
- (optionally, in the future) decide a purely cosmetic initial redirect.

**Cookie presence is not, and must never be treated as, proof of a live,
authenticated SalesChain session.** Every future request for real Partner
data (referrals, commissions, profile) must independently authorize itself
against SalesChain using this bearer token; it cannot rely on the cookie
merely existing. `app/portal/page.tsx` documents this same boundary
in-line and deliberately does not gate itself on cookie presence. A future
`whoami` or Partner-resource endpoint on SalesChain is required before any
authoritative session introspection can be implemented here.

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
| Partner portal (`/portal`) | Static preview UI, plus a real logout control. No real Partner/lead/commission data; not gated on the session cookie (see "Known limitation" above). |
| BFF routes | Implemented: `app/api/partner-invitations/accept`, `app/api/partner-sessions/logout`. |
| SalesChain client | Implemented: `lib/saleschain/client.ts`, `lib/saleschain/config.ts`, `lib/saleschain/session-cookie.ts`. |

## Environment variables

See [`.env.example`](../.env.example) for the names of environment
variables this integration needs. It contains names only — no values, no
credentials. Do not commit a `.env` file with real values.
