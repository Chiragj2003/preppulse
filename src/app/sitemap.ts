import type { MetadataRoute } from "next";

import { env } from "@/lib/env";

/**
 * Only the publicly reachable pages. Everything else requires a session, so
 * listing it would be advertising URLs that answer with a redirect.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    { url: env.appUrl, lastModified: now, changeFrequency: "daily", priority: 1 },
    {
      url: `${env.appUrl}/pricing`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${env.appUrl}/sign-in`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.4,
    },
  ];
}
