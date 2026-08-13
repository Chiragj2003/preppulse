import type { MetadataRoute } from "next";

import { env } from "@/lib/env";

/**
 * Crawlers get the marketing surface and nothing else.
 *
 * Everything behind auth is disallowed explicitly rather than left to chance:
 * those routes redirect to sign-in anyway, so crawling them wastes budget on
 * pages that can never be indexed, and `/s/` share cards are opt-in personal
 * results that shouldn't turn up in search.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin",
          "/dashboard",
          "/practice",
          "/interview",
          "/interview-prep",
          "/discuss",
          "/rooms",
          "/progress",
          "/settings",
          "/onboarding",
          "/s/",
        ],
      },
    ],
    sitemap: `${env.appUrl}/sitemap.xml`,
    host: env.appUrl,
  };
}
