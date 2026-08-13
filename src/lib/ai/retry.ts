/**
 * Retry policy shared by both providers.
 *
 * It lives in its own module rather than in either client because gemini.ts
 * imports groq.ts for cross-provider fallback, so anything they both need has
 * to sit underneath the pair of them.
 */

/**
 * Three attempts per model at 0.8s / 1.6s / 3.2s, then the next model id.
 *
 * Gemini answers 503 "This model is currently experiencing high demand" fairly
 * often, and it means exactly what it says: wait and it works. Falling through
 * to another model id afterwards is a second real chance rather than a
 * formality, because a different id has separate capacity.
 */
export const MAX_ATTEMPTS_PER_MODEL = 3;
export const BACKOFF_MS = 800;

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Backoff for a given attempt number, 1-indexed. */
export const backoffFor = (attempt: number) => BACKOFF_MS * 2 ** (attempt - 1);

/**
 * Overloaded, rate-limited or timed out — conditions that clear on their own.
 *
 * 429 is included deliberately: both providers return it for a per-minute
 * burst, not a permanent ban, and backing off is the documented response.
 */
export function isTransient(error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  if (status === 429 || (status !== undefined && status >= 500)) return true;

  const name = (error as { name?: string })?.name;
  if (name === "TimeoutError" || name === "AbortError") return true;

  const message = error instanceof Error ? error.message : "";
  return /overloaded|UNAVAILABLE|high demand|try again|fetch failed|ECONNRESET/i.test(message);
}

/**
 * A retired or misspelled model id. No amount of waiting helps; only a
 * different id does.
 *
 * The patterns from both providers are unioned here. Keeping two near-identical
 * predicates apart bought nothing except the chance for one to drift.
 */
export function isModelUnavailable(error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  const message = error instanceof Error ? error.message : "";
  return (
    status === 404 ||
    /not found|NOT_FOUND|is not supported|decommission|does not exist|model_not_found/i.test(
      message,
    )
  );
}

/**
 * The provider answered fine but the content was wrong — empty, or JSON that
 * doesn't match the schema.
 *
 * Distinguished from transport failures because it changes what to do next:
 * a busy provider is worth asking again, or asking someone else. Malformed
 * content usually means our prompt or schema is wrong, and quietly failing over
 * to a second provider would hide a bug we need to see while doubling its cost.
 */
export function isContentError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  return /returned no content|unexpected JSON|empty completion/i.test(message);
}
