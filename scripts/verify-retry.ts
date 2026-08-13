/**
 * Checks that a transient Gemini failure is retried rather than surfaced.
 *
 *   npx tsx --env-file=.env scripts/verify-retry.ts
 *
 * The 503 "This model is currently experiencing high demand" took down the
 * whole start-interview flow. Rather than wait for Google to be busy again,
 * fetch is stubbed to fail the way it failed in production, then recover — so
 * the assertion is about our backoff, not about their capacity today.
 */
import { z } from "zod";

import { callGemini } from "../src/lib/ai/gemini";

const realFetch = globalThis.fetch;

/** The exact body Gemini returned when this broke. */
const OVERLOADED = JSON.stringify({
  error: {
    code: 503,
    message:
      "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.",
    status: "UNAVAILABLE",
  },
});

/**
 * Only Gemini requests are intercepted.
 *
 * The first version of this stubbed fetch wholesale, which also caught the Neon
 * driver — it speaks HTTP too. That inflated the call count and, worse, spent
 * the failure budget on database round-trips, so "two 503s" was really testing
 * one. Anything that isn't Gemini goes to the real fetch.
 */
function stubFetch({ failures, status }: { failures: number; status: number }) {
  let calls = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes("generativelanguage.googleapis.com")) {
      return realFetch(input, init);
    }

    calls += 1;
    if (calls <= failures) {
      return new Response(status === 503 ? OVERLOADED : `{"error":{"code":${status}}}`, {
        status,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
  return () => calls;
}

const Schema = z.object({ ok: z.boolean() });

async function run(label: string, setup: { failures: number; status: number }, expectPass: boolean) {
  const calls = stubFetch(setup);
  const startedAt = Date.now();

  let passed: boolean;
  let detail: string;
  try {
    const result = await callGemini({
      parts: [{ text: "ping" }],
      schema: Schema,
      operation: "verify_retry",
      userId: "verify-script",
    });
    passed = result.ok === true;
    detail = `recovered after ${calls()} calls`;
  } catch (error) {
    passed = false;
    detail = `threw after ${calls()} calls: ${error instanceof Error ? error.message : error}`;
  }

  const ok = passed === expectPass;
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${label.padEnd(38)} ${String(Date.now() - startedAt).padStart(5)}ms  ${detail}`,
  );
  return ok;
}

async function main() {
  process.env.GEMINI_API_KEY ??= "stubbed-for-this-script";
  // The usage table is real and this user id is not, so the FK violation would
  // spam the output. The client already treats a failed write as non-fatal.
  console.error = () => {};

  console.log("Transient failures should be retried, permanent ones should not:\n");

  const results = [
    // One 503 then success: the exact production failure, now survivable.
    await run("one 503, then success", { failures: 1, status: 503 }, true),
    // Two 503s: still inside the three attempts allowed per model, so this
    // must take at least 800 + 1600ms of backoff before it succeeds.
    await run("two 503s, then success", { failures: 2, status: 503 }, true),
    // A burst rate limit is also temporary.
    await run("429 rate limit, then success", { failures: 1, status: 429 }, true),
    // A bad key will fail identically however many times we ask, so it must
    // fail fast rather than burn twelve calls discovering that.
    await run("401 bad key fails immediately", { failures: 99, status: 401 }, false),
  ];

  globalThis.fetch = realFetch;

  const failures = results.filter((ok) => !ok).length;
  console.log(
    failures === 0
      ? "\nTransient Gemini failures no longer reach the user."
      : `\n${failures} of ${results.length} checks failed.`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("\nFAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
