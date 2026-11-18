// iOS Universal Links association (/.well-known/apple-app-site-association) for the affiliate host, served only where the Apple Team ID is configured.
//
// The paths are the affiliate host's journeys the app opens (kept in sync with the Android manifest and the iOS entitlement of the mobile shell):
// the customer QR/referral link (/r/<code>), the partner application (/apply/...), the invitation (/einladung) and the partner portal (/portal).
export const APPLE_BUNDLE_ID = "net.fertighaus.affiliate";
const TEAM_ID = /^[A-Z0-9]{10}$/;
export const AFFILIATE_APP_PATHS = ["/r/*", "/apply/*", "/einladung", "/portal*"] as const;

export type AppleAssociation = {
  applinks: { details: Array<{ appIDs: string[]; components: Array<{ "/": string }> }> };
};

/** Returns the association, or null when nothing is configured or the Team ID is malformed (fail closed). */
export function appleAssociationFor(env: Record<string, string | undefined> = process.env): AppleAssociation | null {
  const teamId = env.APPLE_APP_LINKS_TEAM_ID?.trim().toUpperCase();
  if (!teamId || !TEAM_ID.test(teamId)) return null;
  return {
    applinks: { details: [{ appIDs: [`${teamId}.${APPLE_BUNDLE_ID}`], components: AFFILIATE_APP_PATHS.map((path) => ({ "/": path })) }] },
  };
}
