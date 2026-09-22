/**
 * Server-only configuration for the SalesChain BFF integration.
 *
 * This module must never be imported from a Client Component. It only ever
 * reads `SALESCHAIN_API_BASE_URL` — a server-only variable, never prefixed
 * with `NEXT_PUBLIC_` — and never reads or returns a value that could
 * reveal a real, currently-configured SalesChain environment beyond the
 * base URL itself.
 */

export class SalesChainConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SalesChainConfigError";
  }
}

function isProductionEnvironment(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Resolves and validates the SalesChain API base URL.
 *
 * - Must be an absolute `https:` URL in Production.
 * - Outside Production only, an explicit `http://localhost` (or
 *   `http://127.0.0.1`) URL is also permitted, for local development
 *   against a local SalesChain instance.
 * - Trailing slashes are trimmed deterministically so callers can safely
 *   concatenate a leading-slash path.
 */
export function getSalesChainBaseUrl(): string {
  const raw = process.env.SALESCHAIN_API_BASE_URL?.trim();

  if (!raw) {
    throw new SalesChainConfigError("SALESCHAIN_API_BASE_URL is not configured");
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SalesChainConfigError("SALESCHAIN_API_BASE_URL is not a valid absolute URL");
  }

  if (url.search || url.hash) {
    throw new SalesChainConfigError(
      "SALESCHAIN_API_BASE_URL must not contain a query string or fragment"
    );
  }

  if (url.username || url.password) {
    throw new SalesChainConfigError("SALESCHAIN_API_BASE_URL must not contain credentials");
  }

  if (url.pathname !== "/") {
    throw new SalesChainConfigError("SALESCHAIN_API_BASE_URL must not contain a path");
  }

  const production = isProductionEnvironment();
  const isLocalHttp =
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1");

  if (url.protocol !== "https:" && !(isLocalHttp && !production)) {
    throw new SalesChainConfigError(
      production
        ? "SALESCHAIN_API_BASE_URL must be an absolute https:// URL in Production"
        : "SALESCHAIN_API_BASE_URL must be an absolute https:// URL, or an explicit http://localhost URL for local development"
    );
  }

  return url.origin;
}
