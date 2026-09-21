import type { MetadataRoute } from "next";

/**
 * The Partner Portal is a preview and must not be indexed until the real
 * portal is approved and launched. No sitemap is declared for the same
 * reason.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
