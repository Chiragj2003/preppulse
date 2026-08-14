import { clamp } from "./scoring";

/**
 * Camera presence maths. No I/O, no model calls — the detection happens in the
 * browser, and everything below is arithmetic over the frames it produced.
 *
 * This reverses D61, which dropped video as out of scope. It comes back for one
 * reason: whether you stayed in frame and kept your head still is a real part
 * of how an interview lands, and it is *countable* — which is the only kind of
 * thing this codebase measures.
 *
 * ── The limit, stated once here and again in the UI ────────────────────────
 *
 * `faceExpressionNet` is a seven-class classifier trained largely on posed
 * faces. Spontaneous expression is far subtler than the poses it learned, and
 * webcam lighting is worse than a dataset's. So "expressiveness 18%" means the
 * classifier's top label was something other than neutral in 18% of frames —
 * it does not mean you were 18% expressive, and it is not an emotion reading.
 *
 * Presence, absence and head movement are geometry and are trustworthy.
 * Expression is a weak signal shown as a hint, never as a score.
 */

export const EXPRESSIONS = [
  "neutral",
  "happy",
  "sad",
  "angry",
  "surprised",
  "fearful",
  "disgusted",
] as const;

export type Expression = (typeof EXPRESSIONS)[number];

export interface PresenceSample {
  /** Milliseconds since the recording started. */
  at: number;
  /** Whether a face was found in this frame. */
  present: boolean;
  /** Per-label probabilities. Absent when no face was found. */
  expressions?: Partial<Record<Expression, number>>;
  /** Face box centre, normalised 0-1 against the video. Absent when no face. */
  centre?: { x: number; y: number };
}

export interface AbsenceGap {
  startedAt: number;
  seconds: number;
}

export interface PresenceSummary {
  /** 0-100. Share of sampled frames where a face was found. */
  inFrame: number;
  /** Times the face disappeared for longer than the blink threshold. */
  lookAways: number;
  /** The longest single absence, in seconds. */
  longestAbsenceSeconds: number;
  absences: AbsenceGap[];
  /** 0-100. Share of face-present frames whose top label wasn't neutral. */
  expressiveness: number;
  dominant: Expression | null;
  secondary: Expression | null;
  /** 0-100 each, from the face-present frames. */
  positivity: number;
  tension: number;
  /** 0-100. How often the top label changed between consecutive frames. */
  flipRate: number;
  /** 0-100. Head movement: 0 is rock still, 100 is roaming. */
  headDrift: number;
  /** 0-100 composite over the things geometry can actually establish. */
  steadiness: number;
  samples: number;
}

/**
 * A face can vanish for a frame or two from a blink, a hand, or the detector
 * simply missing — that is noise, not looking away. Half a second of continuous
 * absence is the point where a person watching would notice.
 */
const LOOK_AWAY_MS = 500;

/** Weightings for the two composite feelings. Positive lifts, the rest presses. */
const POSITIVE: Expression[] = ["happy", "surprised"];
const NEGATIVE: Expression[] = ["angry", "sad", "fearful", "disgusted"];

function topExpression(
  expressions: Partial<Record<Expression, number>> | undefined,
): Expression | null {
  if (!expressions) return null;
  let best: Expression | null = null;
  let bestValue = -1;
  for (const label of EXPRESSIONS) {
    const value = expressions[label] ?? 0;
    if (value > bestValue) {
      bestValue = value;
      best = label;
    }
  }
  return bestValue > 0 ? best : null;
}

/** Population standard deviation. Returns 0 for fewer than two values. */
export function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Find every stretch where the face was missing for longer than a blink.
 *
 * Works off sample timestamps rather than counting frames, because the
 * detection loop is a `setInterval` competing with the main thread — under load
 * it drops frames, and a gap measured in frames would shrink exactly when the
 * machine is busiest.
 */
export function findAbsences(samples: PresenceSample[]): AbsenceGap[] {
  const gaps: AbsenceGap[] = [];
  let runStart: number | null = null;
  let runEnd = 0;

  for (const sample of samples) {
    if (!sample.present) {
      if (runStart === null) runStart = sample.at;
      runEnd = sample.at;
    } else if (runStart !== null) {
      const ms = runEnd - runStart;
      if (ms >= LOOK_AWAY_MS) gaps.push({ startedAt: runStart, seconds: ms / 1000 });
      runStart = null;
    }
  }

  // A recording that ends while the face is still missing still counts.
  if (runStart !== null) {
    const ms = runEnd - runStart;
    if (ms >= LOOK_AWAY_MS) gaps.push({ startedAt: runStart, seconds: ms / 1000 });
  }

  return gaps;
}

export function summarisePresence(samples: PresenceSample[]): PresenceSummary {
  const empty: PresenceSummary = {
    inFrame: 0,
    lookAways: 0,
    longestAbsenceSeconds: 0,
    absences: [],
    expressiveness: 0,
    dominant: null,
    secondary: null,
    positivity: 0,
    tension: 0,
    flipRate: 0,
    headDrift: 0,
    steadiness: 0,
    samples: 0,
  };
  if (samples.length === 0) return empty;

  const present = samples.filter((s) => s.present);
  const inFrame = clamp(Math.round((present.length / samples.length) * 100));

  const absences = findAbsences(samples);
  const longestAbsenceSeconds =
    absences.length === 0 ? 0 : Math.max(...absences.map((gap) => gap.seconds));

  // Expression averages over face-present frames only. Averaging in the frames
  // where no face was found would drag every label toward zero and make a
  // recording look calmer the more often the user left the shot.
  const totals: Record<Expression, number> = {
    neutral: 0, happy: 0, sad: 0, angry: 0, surprised: 0, fearful: 0, disgusted: 0,
  };
  let expressiveFrames = 0;
  let flips = 0;
  let previousTop: Expression | null = null;

  for (const sample of present) {
    for (const label of EXPRESSIONS) totals[label] += sample.expressions?.[label] ?? 0;

    const top = topExpression(sample.expressions);
    if (top && top !== "neutral") expressiveFrames++;
    if (top && previousTop && top !== previousTop) flips++;
    if (top) previousTop = top;
  }

  const denominator = Math.max(present.length, 1);
  const averages = EXPRESSIONS.map((label) => ({
    label,
    value: totals[label] / denominator,
  })).sort((a, b) => b.value - a.value);

  const positivity = clamp(
    Math.round(POSITIVE.reduce((sum, l) => sum + totals[l] / denominator, 0) * 100),
  );
  const tension = clamp(
    Math.round(NEGATIVE.reduce((sum, l) => sum + totals[l] / denominator, 0) * 100),
  );

  // Head drift: spread of the face centre across the frame. A standard
  // deviation of 0.10 of the frame width is a lot of movement for someone
  // sitting still, so that is taken as the top of the scale.
  const xs = present.map((s) => s.centre?.x ?? 0).filter((v) => v > 0);
  const ys = present.map((s) => s.centre?.y ?? 0).filter((v) => v > 0);
  const drift = (standardDeviation(xs) + standardDeviation(ys)) / 2;
  const headDrift = clamp(Math.round((drift / 0.1) * 100));

  const flipRate =
    present.length < 2 ? 0 : clamp(Math.round((flips / (present.length - 1)) * 100));

  // Steadiness deliberately uses only geometry — being in frame and holding
  // still. Expression is too weak a signal to put inside a score.
  const steadiness = clamp(Math.round(inFrame * 0.6 + (100 - headDrift) * 0.4));

  return {
    inFrame,
    lookAways: absences.length,
    longestAbsenceSeconds: Math.round(longestAbsenceSeconds * 10) / 10,
    absences,
    expressiveness: clamp(Math.round((expressiveFrames / denominator) * 100)),
    dominant: averages[0]?.value > 0 ? averages[0].label : null,
    secondary: averages[1]?.value > 0 ? averages[1].label : null,
    positivity,
    tension,
    flipRate,
    headDrift,
    steadiness,
    samples: samples.length,
  };
}

/**
 * Plain-language readings.
 *
 * Thresholds live here rather than in the component so the wording and the
 * number can never disagree, and so the boundaries are testable.
 */
export function interpretPresence(summary: PresenceSummary): string[] {
  const notes: string[] = [];

  if (summary.samples === 0) return notes;

  if (summary.inFrame >= 95) notes.push("You held the frame the whole way through.");
  else if (summary.inFrame >= 80)
    notes.push(`You were in shot ${summary.inFrame}% of the time — a few glances away.`);
  else
    notes.push(
      `You were out of shot for ${100 - summary.inFrame}% of it, which reads as distracted on a call.`,
    );

  if (summary.lookAways > 0) {
    notes.push(
      summary.lookAways === 1
        ? `One look away, ${summary.longestAbsenceSeconds}s long.`
        : `${summary.lookAways} looks away, the longest ${summary.longestAbsenceSeconds}s.`,
    );
  }

  if (summary.headDrift >= 70) notes.push("A lot of head movement — try planting your elbows.");
  else if (summary.headDrift <= 15) notes.push("Very still. Composed rather than stiff.");

  if (summary.expressiveness < 15)
    notes.push("Your face stayed close to neutral, which can read as flat.");
  else if (summary.expressiveness > 60)
    notes.push("Plenty of movement in your face — engaged, and worth keeping.");

  return notes;
}
