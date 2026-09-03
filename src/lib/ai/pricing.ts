/**
 * Local price table, USD per 1M tokens.
 *
 * These are estimates used for the Phase 8 cost dashboard — the providers' own
 * billing is the source of truth. Unknown models fall back to zero rather than
 * inventing a number, so an unpriced model reads as "unknown", not "free".
 */
interface Price {
  input: number;
  output: number;
}

const PRICES: Record<string, Price> = {
  // Groq
  "llama-3.3-70b-versatile": { input: 0.59, output: 0.79 },
  "llama-3.1-8b-instant": { input: 0.05, output: 0.08 },
  "openai/gpt-oss-120b": { input: 0.15, output: 0.75 },
  "openai/gpt-oss-20b": { input: 0.1, output: 0.5 },
  // Gemini (Phase 3) — free tier bills at 0, paid tier shown for realism
  "gemini-2.0-flash": { input: 0.1, output: 0.4 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  // OpenRouter free tier — genuinely $0, not "unknown". Listed explicitly so
  // the admin cost page shows a priced $0 rather than an unpriced dash.
  "z-ai/glm-5.2:free": { input: 0, output: 0 },
  "google/gemma-4-31b-it:free": { input: 0, output: 0 },
  "minimax/minimax-m3:free": { input: 0, output: 0 },
};

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICES[model];
  if (!price) return 0;
  const cost = (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
  // 6dp matches the numeric(12,6) column.
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export function isPriced(model: string): boolean {
  return model in PRICES;
}
