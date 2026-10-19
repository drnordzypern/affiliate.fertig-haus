# Local real-API end-to-end tests

Opt-in tests that drive the public journeys (`/apply`, `/apply/<code>`, `/r/<code>`) in a real
browser against the **real SalesChain API** and a **disposable local PostgreSQL database**. They
exercise the whole path: browser, this app's BFF, the SalesChain API, the database.

Nothing here can reach production: the database URL comes only from the guarded
`SALESCHAIN_INTEGRATION_*` variables (SalesChain's own ten-check gate), the API base URL is a loopback
address, no e-mail is sent, and the API runs in review mode because SalesChain refuses a local
database in any other mode.

## What is real and what is stand-in

| Real | Stand-in (test tooling only) |
| --- | --- |
| The browser, this app (dev server), the BFF, the SalesChain API built from its checkout, PostgreSQL, the migrations, the SalesChain Turnstile verifier (it still sends its secret and still checks success, action and hostname) | Cloudflare: the widget script is replaced in the browser by a stub, and `siteverify` is answered locally by `e2e/support/cloudflare-standin.cjs`, preloaded only into the local API process |
| The consent registry **as shipped** (empty) in the `shipped` project | In the `consent-fixture` project only, a git-ignored copy of the app whose registry line carries clearly-labelled FIXTURE wording (the shipped file is never modified) |

## Projects

| Project | Server | Proves |
| --- | --- | --- |
| `shipped` | this app, gates open, registry empty | password boundary still guards every page and route; with no approved wording each page says so, shows no form, SalesChain records nothing, and the BFF cannot be bypassed; cross-origin calls are refused |
| `consent-fixture` | copy with fixture wording, gates open | direct and referred applications (sponsor, QR, consent version, audit), customer referral (partner credit, QR, campaign values, consent evidence, no application, no commission), lost-answer retry, Turnstile refusal (bad token, wrong action, wrong hostname), validation, repeat registration, purpose separation, revoked/unknown/half-present QR, nothing sensitive in the browser, rate limiting |
| `gates-closed` | shipped source, gates unset | every page closed, every BFF route 404, SalesChain never contacted |

## Run

Playwright is **not** a dependency of this repository (adding it would rewrite the lockfile); use the
Playwright of a SalesChain checkout. The tests need a built SalesChain API and a seeded disposable
database:

```powershell
# 1. In the SalesChain checkout (feat/affiliate-integration or later): a disposable database, then
$env:SALESCHAIN_INTEGRATION_DATABASE_URL = "postgresql://<local user>@127.0.0.1:<port>/saleschain_integration_<name>"
$env:SALESCHAIN_INTEGRATION_DIRECT_URL   = $env:SALESCHAIN_INTEGRATION_DATABASE_URL
$env:SALESCHAIN_INTEGRATION_BRANCH_FINGERPRINT = node -e "console.log(require('./packages/config').databaseIdentityFingerprint(process.argv[1]))" $env:SALESCHAIN_INTEGRATION_DATABASE_URL
$env:SALESCHAIN_INTEGRATION_DESTRUCTIVE_ACK = "yes-disposable-branch-only"
$env:E2E_AUTH_SESSION_SECRET = "<40 random characters>"; $env:AUTH_SESSION_SECRET = $env:E2E_AUTH_SESSION_SECRET
$env:E2E_SEED_FILE = "$env:TEMP\affiliate-e2e-seed.json"
pnpm --filter @saleschain/database test:integration:prepare
pnpm --filter @saleschain/api build
cd packages\database; npx tsx test-integration/e2e-affiliate-seed.ts $env:E2E_SEED_FILE; cd ..\..

# 2. Run the tests with SalesChain's Playwright
$env:SALESCHAIN_REPO_DIR = (Get-Location).Path
$env:NODE_PATH = "$env:SALESCHAIN_REPO_DIR\apps\web\node_modules"
cd apps\web
npx playwright test -c <path to this repo>\playwright.real-api.config.ts
```

Each seeded database can be used for several runs (every test uses unique e-mail addresses and
compares row counts relative to its own start); drop and recreate it when you want a clean slate.
`psql` is used for read-only checks; set `PSQL` if it is not at `C:\Program Files\PostgreSQL\17\bin\psql.exe`.

## Notes

- The app servers are addressed as `localhost`: in `next dev` a route handler sees `request.url` as
  `http://localhost:<port>`, so the BFF same-origin check only matches a browser that also says
  `localhost`. (On Vercel the request URL carries the real host, as for the invitation flow.)
- The rate-limit test saturates the direct-application submit bucket (10 per minute per address) on
  purpose and runs last; run the suite again after a minute.
- A production-mode run is not possible locally: SalesChain's configuration refuses a local database
  unless `APP_MODE=review`. The production gate itself is covered by SalesChain's unit tests.