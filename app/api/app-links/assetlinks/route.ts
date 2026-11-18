import { assetLinksFor } from "@/lib/app-links/android";

// Reached through the rewrite /.well-known/assetlinks.json (next.config.ts). Plain JSON, no redirect, as Android requires.
export const dynamic = "force-dynamic";

export function GET(): Response {
  const links = assetLinksFor();
  if (!links) return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  return new Response(JSON.stringify(links, null, 2) + "\n", {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "public, max-age=300" },
  });
}
