import { appleAssociationFor } from "@/lib/app-links/apple";

// Reached through the rewrite /.well-known/apple-app-site-association (next.config.ts). Plain JSON, no redirect, no file extension, as iOS requires.
export const dynamic = "force-dynamic";

export function GET(): Response {
  const association = appleAssociationFor();
  if (!association) return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  return new Response(JSON.stringify(association, null, 2) + "\n", {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "public, max-age=300" },
  });
}
