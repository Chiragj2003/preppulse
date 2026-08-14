import { clamp } from "./scoring";

/**
 * Reading practice maths. No I/O, no model calls.
 *
 * This is the mode where the governing rule pays off hardest: we have the exact
 * text the user was asked to read, so "did they read it correctly" is a
 * measurement, not an opinion. Every number below is computed by aligning what
 * the recogniser heard against the passage. The model is asked one question at
 * the end — what to work on — and nothing else.
 *
 * ── An honest limit, stated once here and again in the UI ──────────────────
 *
 * The Web Speech API is not a pronunciation scorer. It runs a language model
 * over the audio, so it will quietly repair a slurred word into the word it
 * expected — especially in a familiar phrase like a tongue twister. It can also
 * miss an unusual word that was said perfectly.
 *
 * So accuracy here measures *how intelligibly you read to a speech recogniser*,
 * which correlates with clarity but is not the same thing. Calling it a
 * pronunciation score would be inventing precision we do not have. Pace,
 * completion and hesitation, by contrast, are measured directly and are solid.
 */

export type AlignOp = "match" | "substitute" | "insert" | "delete";

export interface AlignedWord {
  op: AlignOp;
  /** The word from the passage. Absent on an insertion — nothing was expected. */
  expected?: string;
  /** The word the recogniser heard. Absent on a deletion — nothing was said. */
  heard?: string;
}

export interface ReadingMetrics {
  /** 0-100. Share of passage words the recogniser matched. */
  accuracy: number;
  /** Words per minute over the whole attempt. */
  wordsPerMinute: number;
  /** 0-100. How far through the passage they got before stopping. */
  completion: number;
  /** 0-100, from words-per-minute against the passage's target band. */
  paceScore: number;
  /** Counts, straight off the alignment. */
  matched: number;
  substituted: number;
  skipped: number;
  added: number;
  /** Passage length in words, so the UI can show "38 of 42". */
  totalWords: number;
  /** The full alignment, for word-by-word highlighting in the report. */
  alignment: AlignedWord[];
  /** The passage words the reader did not land, deduped and in order. */
  stumbles: string[];
}

/**
 * Everything past this is a pathological input, not a reading attempt.
 *
 * The alignment is O(reference x heard); the cap keeps a runaway transcript
 * from turning one request into a several-second CPU burn on a serverless
 * function billed by the millisecond.
 */
const MAX_WORDS = 1200;

/** Small numbers arrive as digits from the recogniser and as words in a passage. */
const NUMBER_WORDS: Record<string, string> = {
  "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four", "5": "five",
  "6": "six", "7": "seven", "8": "eight", "9": "nine", "10": "ten",
  "11": "eleven", "12": "twelve", "20": "twenty", "30": "thirty", "50": "fifty",
  "100": "hundred", "1000": "thousand",
};

/**
 * Reduce a word to what actually matters for "did they say this".
 *
 * Punctuation, case and apostrophes are the recogniser's business, not the
 * reader's — "don't" and "dont" are the same spoken word, and marking someone
 * down for an apostrophe they cannot pronounce would be nonsense.
 */
export function normaliseWord(word: string): string {
  const bare = word
    .toLowerCase()
    .replace(/[‘’']/g, "")
    .replace(/[^a-z0-9]/g, "");
  return NUMBER_WORDS[bare] ?? bare;
}

export function toWords(text: string): string[] {
  return text
    .split(/\s+/)
    .map(normaliseWord)
    .filter((word) => word.length > 0)
    .slice(0, MAX_WORDS);
}

/**
 * Word-level alignment by Levenshtein edit distance with a backtrace.
 *
 * The naive comparison — walk both lists in step and compare position by
 * position — falls apart on the first skipped word, because everything after it
 * is off by one and scores as wrong. A single dropped "the" would report a
 * near-total failure. Alignment finds the cheapest set of edits instead, so a
 * skip costs exactly one skip.
 */
export function alignWords(expected: string[], heard: string[]): AlignedWord[] {
  const n = expected.length;
  const m = heard.length;

  // distance[i][j] = edits to turn expected[0..i) into heard[0..j)
  const distance: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = 0; i <= n; i++) distance[i][0] = i;
  for (let j = 0; j <= m; j++) distance[0][j] = j;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const sameWord = expected[i - 1] === heard[j - 1];
      distance[i][j] = Math.min(
        distance[i - 1][j - 1] + (sameWord ? 0 : 1),
        distance[i - 1][j] + 1, // the reader skipped a word
        distance[i][j - 1] + 1, // the reader added a word
      );
    }
  }

  // Walk back from the corner, preferring diagonal moves so a matched word is
  // never reported as an insert-plus-delete pair.
  const alignment: AlignedWord[] = [];
  let i = n;
  let j = m;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const sameWord = expected[i - 1] === heard[j - 1];
      if (distance[i][j] === distance[i - 1][j - 1] + (sameWord ? 0 : 1)) {
        alignment.push({
          op: sameWord ? "match" : "substitute",
          expected: expected[i - 1],
          heard: heard[j - 1],
        });
        i--;
        j--;
        continue;
      }
    }
    if (i > 0 && distance[i][j] === distance[i - 1][j] + 1) {
      alignment.push({ op: "delete", expected: expected[i - 1] });
      i--;
      continue;
    }
    alignment.push({ op: "insert", heard: heard[j - 1] });
    j--;
  }

  return alignment.reverse();
}

/**
 * Ideal reading pace.
 *
 * 140-170 wpm is the band comfortable reading aloud sits in — fast enough not
 * to drag, slow enough to articulate. Tongue twisters are deliberately scored
 * against a slower band, because rushing one is how you fail it.
 */
export function paceScoreFor(wpm: number, target: { min: number; max: number }): number {
  if (wpm <= 0) return 0;
  if (wpm >= target.min && wpm <= target.max) return 100;

  // Linear falloff, hitting zero one full band-width outside the target.
  const width = Math.max(20, target.max - target.min);
  const distance = wpm < target.min ? target.min - wpm : wpm - target.max;
  return clamp(Math.round(100 - (distance / width) * 100));
}

export function scoreReading(input: {
  passage: string;
  transcript: string;
  durationSeconds: number;
  paceTarget?: { min: number; max: number };
}): ReadingMetrics {
  const expected = toWords(input.passage);
  const heard = toWords(input.transcript);
  const alignment = alignWords(expected, heard);

  let matched = 0;
  let substituted = 0;
  let skipped = 0;
  let added = 0;

  for (const step of alignment) {
    if (step.op === "match") matched++;
    else if (step.op === "substitute") substituted++;
    else if (step.op === "delete") skipped++;
    else added++;
  }

  const totalWords = expected.length;
  const accuracy = totalWords === 0 ? 0 : clamp(Math.round((matched / totalWords) * 100));

  // Completion is where they stopped, not how much they got right. Trailing
  // skips mean they gave up partway; skips in the middle are misreads and
  // shouldn't be counted as an incomplete attempt.
  let lastAttempted = 0;
  let position = 0;
  for (const step of alignment) {
    if (step.op !== "insert") position++;
    if (step.op === "match" || step.op === "substitute") lastAttempted = position;
  }
  const completion = totalWords === 0 ? 0 : clamp(Math.round((lastAttempted / totalWords) * 100));

  const minutes = Math.max(input.durationSeconds, 1) / 60;
  const wordsPerMinute = Math.round(heard.length / minutes);
  const paceScore = paceScoreFor(wordsPerMinute, input.paceTarget ?? { min: 140, max: 170 });

  // The words worth practising: what the passage asked for and didn't get.
  const stumbles: string[] = [];
  const seen = new Set<string>();
  for (const step of alignment) {
    if ((step.op === "substitute" || step.op === "delete") && step.expected) {
      if (!seen.has(step.expected)) {
        seen.add(step.expected);
        stumbles.push(step.expected);
      }
    }
  }

  return {
    accuracy,
    wordsPerMinute,
    completion,
    paceScore,
    matched,
    substituted,
    skipped,
    added,
    totalWords,
    alignment,
    stumbles,
  };
}

/**
 * The headline number.
 *
 * Accuracy dominates because reading the words that are actually written is the
 * task; pace is a real but secondary skill, and completion is a gate — walking
 * out halfway should not leave you with a good score on the part you did read.
 */
export function overallReadingScore(metrics: ReadingMetrics): number {
  const core = metrics.accuracy * 0.7 + metrics.paceScore * 0.3;
  const completionFactor = 0.5 + (metrics.completion / 100) * 0.5;
  return clamp(Math.round(core * completionFactor));
}
