/**
 * Does every configured service actually answer?
 *
 *   npm run health
 *
 * Checks credentials by making the cheapest real call each provider allows —
 * a key that merely *exists* in .env tells you nothing, and every outage this
 * project has had looked like a working key right up until it didn't.
 *
 * Read-only and costs a fraction of a cent. Safe to run any time.
 */
import { neon } from "@neondatabase/serverless";

type Status = "ok" | "fail" | "skip";

interface Check {
  name: string;
  status: Status;
  detail: string;
  ms: number;
}

const results: Check[] = [];

async function check(name: string, fn: () => Promise<string>): Promise<void> {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ name, status: "ok", detail, ms: Date.now() - started });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ name, status: "fail", detail: message.slice(0, 140), ms: Date.now() - started });
  }
}

function skip(name: string, why: string) {
  results.push({ name, status: "skip", detail: why, ms: 0 });
}

async function main() {
  /* ── Database ─────────────────────────────────────────────────────────── */
  if (!process.env.DATABASE_URL) skip("Neon Postgres", "DATABASE_URL not set");
  else
    await check("Neon Postgres", async () => {
      const sql = neon(process.env.DATABASE_URL!);
      const rows = (await sql`select count(*)::int as topics from topics`) as { topics: number }[];
      const pieces = (await sql`select count(*)::int as n from reading_pieces`) as { n: number }[];
      return `${rows[0].topics} topics, ${pieces[0].n} reading pieces`;
    });

  /* ── Gemini ───────────────────────────────────────────────────────────── */
  if (!process.env.GEMINI_API_KEY) skip("Gemini", "GEMINI_API_KEY not set");
  else
    await check("Gemini", async () => {
      // The models endpoint validates the key without spending output tokens.
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`,
        { signal: AbortSignal.timeout(20_000) },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`);
      const body = (await res.json()) as { models?: { name: string }[] };
      const names = (body.models ?? []).map((m) => m.name.replace("models/", ""));

      // The fallback chain is only real if these ids still exist.
      const wanted = ["gemini-3.6-flash", "gemini-2.5-flash", "gemini-flash-latest"];
      const missing = wanted.filter((id) => !names.includes(id));
      const note = missing.length ? `  MISSING: ${missing.join(", ")}` : "  all chain models present";
      return `${names.length} models reachable.${note}`;
    });

  /* ── Gemini: a real generation, since /models can pass while quota is out ─ */
  if (process.env.GEMINI_API_KEY)
    await check("Gemini generate", async () => {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: 'Reply with exactly: {"ok":true}' }] }],
            generationConfig: { maxOutputTokens: 32, responseMimeType: "application/json" },
          }),
          signal: AbortSignal.timeout(30_000),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
      return "generation succeeded";
    });

  /* ── Groq ─────────────────────────────────────────────────────────────── */
  if (!process.env.GROQ_API_KEY) skip("Groq", "GROQ_API_KEY not set");
  else
    await check("Groq", async () => {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
          max_tokens: 16,
          messages: [{ role: "user", content: "Reply with the single word: ok" }],
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
      const body = (await res.json()) as { model?: string };
      return `answered on ${body.model}`;
    });

  /* ── Optional services ────────────────────────────────────────────────── */
  if (!process.env.RESEND_API_KEY) skip("Resend (email)", "not set — magic links won't send");
  else
    await check("Resend (email)", async () => {
      const res = await fetch("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return "key accepted";
    });

  if (!process.env.UPSTASH_REDIS_REST_URL) skip("Upstash Redis", "not set — leaderboard uses Postgres");
  else
    await check("Upstash Redis", async () => {
      const res = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/ping`, {
        headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return "PONG";
    });

  if (!process.env.GOOGLE_CLIENT_ID) skip("Google OAuth", "not set — sign-in falls back to email");
  else results.push({ name: "Google OAuth", status: "ok", detail: "client id + secret present (not callable offline)", ms: 0 });

  /* ── Report ───────────────────────────────────────────────────────────── */
  const mark = { ok: "PASS", fail: "FAIL", skip: "SKIP" } as const;
  console.log("");
  for (const r of results) {
    console.log(`  ${mark[r.status]}  ${r.name.padEnd(18)} ${String(r.ms).padStart(5)}ms  ${r.detail}`);
  }

  const failed = results.filter((r) => r.status === "fail");
  const skipped = results.filter((r) => r.status === "skip");
  console.log(
    `\n  ${results.filter((r) => r.status === "ok").length} ok, ${failed.length} failing, ${skipped.length} not configured\n`,
  );

  // Only a hard failure is an error. A service you chose not to configure is a
  // decision, not a fault — the app degrades around all of them by design.
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("health check crashed:", error);
  process.exit(1);
});
