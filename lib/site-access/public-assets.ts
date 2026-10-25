/**
 * The only files served without the pre-launch access cookie: the home-screen icon, favicon set and web manifest.
 *
 * iPhone and Android fetch these WITHOUT the page's cookie when someone adds the site to the home screen, so behind the
 * password gate they would answer 401 and the device would show a generic icon. They are the brand files already
 * published on fertig-haus.net. The match is an exact path (a plain Set lookup, never a prefix or pattern) and only
 * for GET and HEAD, so every page, form, RSC request and API route - and any near-miss such as "/favicon.svg/",
 * "/favicon.svg.bak" or "/site.webmanifest.json" - stays behind the password. Do not add anything else here.
 */
export const PUBLIC_BRAND_ASSET_PATHS: ReadonlySet<string> = new Set([
  "/apple-touch-icon.png",
  "/favicon.svg",
  "/favicon-32.png",
  "/favicon-48.png",
  "/favicon-192.png",
  "/favicon-512.png",
  "/site.webmanifest",
]);

export function isPublicBrandAsset(pathname: string, method: string): boolean {
  return (method === "GET" || method === "HEAD") && PUBLIC_BRAND_ASSET_PATHS.has(pathname);
}
