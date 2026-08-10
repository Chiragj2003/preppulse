/** Shared domain types used by both the database layer and the UI. */

/** The six dimensions Phase 2 scores a spoken answer on. */
export const SCORE_DIMENSIONS = [
  "fluency",
  "vocabulary",
  "structure",
  "clarity",
  "pace",
  "fillerControl",
] as const;

export type ScoreDimension = (typeof SCORE_DIMENSIONS)[number];

/** Every dimension is scored 0–100. */
export type Scores = Record<ScoreDimension, number>;

export const SCORE_LABELS: Record<ScoreDimension, string> = {
  fluency: "Fluency",
  vocabulary: "Vocabulary",
  structure: "Structure",
  clarity: "Clarity",
  pace: "Pace",
  fillerControl: "Filler control",
};

export const SCORE_HINTS: Record<ScoreDimension, string> = {
  fluency: "How smoothly the answer flowed, without stalling or restarting",
  vocabulary: "Range and precision of the words chosen",
  structure: "Whether the answer had a clear beginning, middle and end",
  clarity: "How easy the point was to follow the first time",
  pace: "Speaking speed — steady and unhurried beats fast",
  fillerControl: "How much 'um', 'like', 'basically' crept in",
};

/**
 * Per-mode weights for the overall score.
 *
 * Deliberately NOT a blind average: for an extempore answer, holding a
 * structure under time pressure is worth more than vocabulary range.
 * Phase 5 extends this table rather than replacing it.
 */
export const SCORE_WEIGHTS: Record<string, Scores> = {
  random_topic: {
    fluency: 0.2,
    vocabulary: 0.15,
    structure: 0.25,
    clarity: 0.2,
    pace: 0.1,
    fillerControl: 0.1,
  },
};

export const DEFAULT_WEIGHTS: Scores = SCORE_WEIGHTS.random_topic;

/** A filler word occurrence located in the transcript, for highlighting. */
export interface FillerHit {
  word: string;
  count: number;
}

export interface EvaluationPayload {
  scores: Scores;
  overallScore: number;
  strengths: string[];
  improvements: string[];
  fillerWords: FillerHit[];
  improvedAnswer: string;
  summary: string;
}

export type PracticeMode =
  | "random_topic"
  | "interview"
  | "group_discussion"
  | "debate"
  | "conversation"
  | "scenario";

export type SessionStatus = "created" | "in_progress" | "completed" | "abandoned";

export type Difficulty = "easy" | "medium" | "hard";

export type Language = "en" | "hinglish" | "hi";

export const LANGUAGE_LABELS: Record<Language, string> = {
  en: "English",
  hinglish: "Hinglish",
  hi: "हिन्दी",
};

/** Structured resume data extracted by Gemini in Phase 3. Stored as JSON only. */
export interface ResumeExtract {
  skills: string[];
  experience: { company: string; role: string; period?: string; highlights?: string[] }[];
  projects: { name: string; description?: string; tech?: string[] }[];
  education?: { institution: string; degree?: string; year?: string }[];
  summary?: string;
}
