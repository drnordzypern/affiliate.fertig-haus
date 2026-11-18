// iOS Universal Links association (/.well-known/apple-app-site-association) for the affiliate host, served only where the Apple Team ID is configured.
//
// The paths are the affiliate host's journeys the app opens (kept in sync with the Android manifest and the iOS entitlement of the mobile shell):
// the invitation (/einladung) and the partner portal (/portal). The two public QR routes are deliberately NOT here, so they always open in the
// browser even when the app is installed: the partner recruitment QR (/apply/...) and the customer QR (/r/<code>, which hands over to fertig-haus.net).
export const APPLE_BUNDLE_ID = "net.fertighaus.affiliate";
const TEAM_ID = /^[A-Z0-9]{10}$/;
export const AFFILIATE_APP_PATHS = ["/einladung", "/portal*"] as const;

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
