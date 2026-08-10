import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * Neon over HTTP: one round trip per query, no connection pool to leak across
 * serverless invocations. The trade-off is no interactive transactions, which
 * is why the Better Auth adapter is configured with `transaction: false`.
 */
function create() {
  return drizzle(neon(env.databaseUrl), { schema });
}

type Database = ReturnType<typeof create>;

let cached: Database | undefined;

/**
 * Resolved lazily so that merely importing this module — which `next build`
 * does while collecting page data — never requires DATABASE_URL to be set.
 * Methods are bound to the real instance so `this` stays correct.
 */
export const db = new Proxy({} as Database, {
  get(_target, prop) {
    cached ??= create();
    const value = Reflect.get(cached, prop) as unknown;
    return typeof value === "function" ? value.bind(cached) : value;
  },
});

export { schema };
