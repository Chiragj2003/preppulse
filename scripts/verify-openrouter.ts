/**
 * Checks the OpenRouter integration end to end, against the real API.
 *
 *   npx tsx --env-file=.env scripts/verify-openrouter.ts
 *
 * Unlike verify-retry.ts (which stubs fetch to test our own backoff logic),
 * this one makes a real call with the real key — the thing worth proving
 * here isn't retry math, it's that the chosen free model actually exists,
 * actually answers, and actually returns JSON `callOpenRouter` can parse.
 * That is exactly the kind of failure a stub can't catch: OpenRouter's free
 * catalog rotates as providers add and drop hosted capacity.
 */
import { z } from "zod";

import { callAI } from "../src/lib/ai/provider";
import { callOpenRouter } from "../src/lib/ai/openrouter";

const Schema = z.object({ ok: z.boolean(), reason: z.string() });

async function run(label: string, fn: () => Promise<{ ok: boolean; reason: string }>) {
  const startedAt = Date.now();
  try {
    const result = await fn();
    const ms = Date.now() - startedAt;
    console.log(`  PASS  ${label.padEnd(38)} ${String(ms).padStart(5)}ms  ${JSON.stringify(result)}`);
    return true;
  } catch (error) {
    const ms = Date.now() - startedAt;
    console.log(
      `  FAIL  ${label.padEnd(38)} ${String(ms).padStart(5)}ms  ${error instanceof Error ? error.message : error}`,
    );
    return false;
  }
}

async function main() {
  // The usage table is real and this user id is not, so the resulting FK
  // violation would spam the output. recordUsage already treats a failed
  // write as non-fatal — see lib/ai/usage.ts.
  console.error = () => {};

  console.log("Calling OpenRouter's free tier for real, with the real key:\n");

  const results = [
    // The client directly, proving the model id, the auth header and the
    // response parsing all actually work against the live API.
    await run("callOpenRouter — direct", () =>
      callOpenRouter({
        prompt:
          'Reply with this exact JSON object and nothing else: {"ok": true, "reason": "direct call"}',
        schema: Schema,
        operation: "verify_openrouter",
        userId: "verify-script",
      }),
    ),
    // The dispatcher, with AI_PROVIDER forced to openrouter — proving the
    // env switch actually routes here rather than to whichever provider a
    // developer's .env happens to default to.
    await run("callAI — routed via AI_PROVIDER=openrouter", () => {
      const prior = process.env.AI_PROVIDER;
      process.env.AI_PROVIDER = "openrouter";
      return callAI({
        prompt:
          'Reply with this exact JSON object and nothing else: {"ok": true, "reason": "via dispatcher"}',
        schema: Schema,
        operation: "verify_openrouter_dispatch",
        userId: "verify-script",
      }).finally(() => {
        process.env.AI_PROVIDER = prior;
      });
    }),
  ];

  const settled = await Promise.all(results);
  const failures = settled.filter((ok) => !ok).length;

  console.log(
    failures === 0
      ? "\nOpenRouter answers for real, both directly and through the AI_PROVIDER switch."
      : `\n${failures} of ${settled.length} checks failed.`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("\nFAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
