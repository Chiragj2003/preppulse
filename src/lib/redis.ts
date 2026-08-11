/**
 * Upstash Redis over its REST API.
 *
 * No SDK: the REST protocol is `POST ["CMD", "arg", ...]` with a bearer token,
 * which is a dozen lines here versus a dependency that only ever gets used for
 * two commands. Same reasoning as the Resend and Gemini clients.
 *
 * Redis is *optional*. Everything that uses it degrades to Postgres when the
 * credentials are absent, so the product works today and gets faster the
 * moment Upstash is configured. Redis earns its place on two real jobs — the
 * rolling leaderboard and cached topic briefs — not as decoration.
 */
const URL = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

export const redisConfigured = Boolean(URL && TOKEN);

type Command = (string | number)[];

async function exec<T>(command: Command): Promise<T | null> {
  if (!redisConfigured) return null;

  try {
    const response = await fetch(URL!, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command.map(String)),
      // A slow cache must never become a slow page.
      signal: AbortSignal.timeout(2500),
      cache: "no-store",
    });

    if (!response.ok) {
      console.warn(`[redis] ${command[0]} returned ${response.status}`);
      return null;
    }

    const payload = (await response.json()) as { result?: T; error?: string };
    if (payload.error) {
      console.warn(`[redis] ${command[0]}: ${payload.error}`);
      return null;
    }
    return payload.result ?? null;
  } catch (error) {
    // Every caller treats null as "cache miss", so a Redis outage degrades to
    // the Postgres path rather than failing the request.
    console.warn(`[redis] ${command[0]} failed`, error);
    return null;
  }
}

/* ── Sorted set: the leaderboard ────────────────────────────────────────── */

export async function zadd(key: string, score: number, member: string) {
  return exec<number>(["ZADD", key, score, member]);
}

/** Highest scores first, as [member, score, member, score, ...]. */
export async function zrevrange(key: string, start: number, stop: number) {
  return exec<string[]>(["ZRANGE", key, start, stop, "REV", "WITHSCORES"]);
}

export async function zscore(key: string, member: string) {
  const raw = await exec<string>(["ZSCORE", key, member]);
  return raw === null ? null : Number(raw);
}

/** Zero-based, highest first. */
export async function zrevrank(key: string, member: string) {
  return exec<number>(["ZRANK", key, member, "REV"]);
}

export async function expire(key: string, seconds: number) {
  return exec<number>(["EXPIRE", key, seconds]);
}

/* ── Strings: cached topic briefs ───────────────────────────────────────── */

export async function getCached(key: string) {
  return exec<string>(["GET", key]);
}

export async function setCached(key: string, value: string, ttlSeconds: number) {
  return exec<string>(["SET", key, value, "EX", ttlSeconds]);
}

/**
 * Leaderboard keys are bucketed by ISO week rather than being one permanent
 * key with manual trimming: the whole bucket expires on its own, so there is
 * no eviction job and no way to accumulate stale members forever.
 */
export function weekKey(date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // ISO week: Thursday determines the year.
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `lb:${d.getUTCFullYear()}-w${String(week).padStart(2, "0")}`;
}

export const LEADERBOARD_TTL_SECONDS = 60 * 60 * 24 * 9; // a week plus slack
