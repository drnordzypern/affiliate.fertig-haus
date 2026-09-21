# Architecture boundary

This document defines what this repository is, what it is not, and the
integration boundary it must respect once SalesChain integration begins.

## What this repository is

`affiliate.fertig-haus` is the **public Partner-facing frontend** for the
future Fertig Haus Partner Portal, served from
`https://affiliate.fertig-haus.net`. It is a Next.js (App Router)
application. In later phases, it will also host a **same-origin Backend
for Frontend (BFF)** — server-side route handlers that mediate between the
browser and SalesChain.

At the current stage, this repository contains only static/preview
frontend pages. No BFF routes exist yet, and no request in this codebase
reaches a real backend.

## What this repository is not

- It is **not** the source of truth for Partner data. `saleschain-os` is.
- It does **not** implement Partner application logic, invitation issuance,
  authentication, authorization, referral/QR attribution, lead handling,
  commission calculation, Partner verification, or audit/compliance
  logic. All of that lives in `saleschain-os`.
- It does **not** contain a database, cache, or persistence layer. No
  database belongs in this repository at this stage, and none is planned
  for the frontend itself — persistence remains SalesChain's
  responsibility.

## Target integration path

```text
Browser
→ affiliate.fertig-haus same-origin BFF
→ SalesChain public/API boundary
→ SalesChain database and business logic
```

The browser talks only to this app's own origin. The BFF (implemented in
this repository, in a later phase) is the only thing allowed to call
SalesChain. The browser never calls SalesChain directly, and SalesChain
credentials never reach the browser.

**Integration is disabled by default.** No Production SalesChain endpoint
is configured in this repository today, and none of the routes in this
codebase call an external service.

## Security rules for the integration (future phases)

These rules apply once BFF routes are implemented. They are documented now
so future changes are held to them from the start:

- **SalesChain credentials are server-only.** Any credential used to call
  SalesChain (see `SALESCHAIN_BFF_CREDENTIAL` in `.env.example`) must only
  ever be read in server-side code (Route Handlers, Server Components,
  Server Actions) and must never be exposed to the browser — not in a
  `NEXT_PUBLIC_*` variable, not embedded in client bundles, not returned
  in an API response body.
- **Raw invitation tokens must never enter query strings, logs, analytics,
  or browser persistence.** They must not appear in `?query=` parameters,
  `console.log`/server logs, analytics events, `localStorage`,
  `sessionStorage`, cookies, or any other persisted store.
- **Future invitation links must use URL fragments** (`#token=...`), not
  query strings, because fragments are never sent to the server on the
  initial request and are easier to scrub from the visible address bar
  immediately after reading. See
  [`components/invitation/InvitationAcceptShell.tsx`](../components/invitation/InvitationAcceptShell.tsx)
  for the structural placeholder this will attach to.
- **The exact SalesChain authentication contract is not yet approved.**
  Do not guess at or implement a specific auth handshake ahead of that
  review.

## Current state of each integration point

| Area | Current state |
| --- | --- |
| Partner application (`/partner-werden`) | Static preview UI only. Submit action is disabled. No API call. |
| Invitation acceptance (`/partner/invitation/accept`) | Static preview shell only. Does not read query parameters or URL fragments, does not call SalesChain, does not persist a token. |
| Partner portal (`/portal`) | Static preview UI only. No authentication, no session, no real Partner/lead/commission data. |
| BFF routes | Not implemented yet. |
| SalesChain client | Not implemented yet. |

## Environment variables

See [`.env.example`](../.env.example) for the names of environment
variables this project anticipates needing once integration begins. It
contains names only — no values, no credentials. Do not commit a `.env`
file with real values.
