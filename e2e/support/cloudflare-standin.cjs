/**
 * LOCAL TEST TOOLING ONLY. Preloaded (node --require) into the LOCAL SalesChain
 * API process that the end-to-end test starts, never into the affiliate app and
 * never into any deployed process.
 *
 * It answers Cloudflare's Turnstile "siteverify" call locally, because the real
 * service cannot be reached with a synthetic widget token. Every other request
 * goes to the real fetch. The SalesChain TurnstileVerifier is otherwise
 * untouched: it still sends its own secret, still checks success, the expected
 * action and the allowed hostname, exactly as in production.
 *
 * Token grammar (what the browser stub in e2e/support/harness.ts mints):
 *   "ok|<action>|<hostname>"  -> success, reporting that action and hostname
 *   anything else             -> success:false (a refused or expired challenge)
 * A request with a different secret than E2E_TURNSTILE_SECRET is refused, so the
 * test also proves the API sends the configured secret.
 */
const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const realFetch = globalThis.fetch.bind(globalThis);

globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url !== SITEVERIFY) return realFetch(input, init);

  let body = {};
  try {
    body = JSON.parse(String(init && init.body));
  } catch {
    // fall through: an unparsable request is a failure below
  }
  const reply = (payload) =>
    new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });

  if (body.secret !== process.env.E2E_TURNSTILE_SECRET) return reply({ success: false, "error-codes": ["invalid-input-secret"] });
  const parts = typeof body.response === "string" ? body.response.split("|") : [];
  if (parts.length === 3 && parts[0] === "ok") return reply({ success: true, action: parts[1], hostname: parts[2] });
  return reply({ success: false, "error-codes": ["invalid-input-response"] });
};
