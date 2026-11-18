// Android App Links verification (/.well-known/assetlinks.json) for the affiliate host, served only where an operator has configured it.
//
// The file names the signing certificates that may open this host's links in the installed Fertig-Haus app. It is generated from a server-only
// environment variable and never committed, so a test signing fingerprint cannot end up on a Production host. Without the variable the route
// answers 404. Same rule and same variable name as the CRM host (apps/web/lib/android-app-links.ts in the SalesChain repository).
export const ANDROID_PACKAGE_NAME = "net.fertighaus.affiliate";
const SHA256 = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

export type AssetLinks = Array<{
  relation: string[];
  target: { namespace: "android_app"; package_name: string; sha256_cert_fingerprints: string[] };
}>;

/** Returns the statement list, or null when nothing is configured or any fingerprint is malformed (fail closed). */
export function assetLinksFor(env: Record<string, string | undefined> = process.env): AssetLinks | null {
  const raw = env.ANDROID_APP_LINKS_CERT_SHA256;
  if (!raw || !raw.trim()) return null;
  const fingerprints = raw
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  if (fingerprints.length === 0 || fingerprints.some((value) => !SHA256.test(value))) return null;
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: ANDROID_PACKAGE_NAME, sha256_cert_fingerprints: [...new Set(fingerprints)] },
    },
  ];
}
