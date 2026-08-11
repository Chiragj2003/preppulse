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

/** Structured resume data extracted by Gemini. Stored as JSON only. */
export interface ResumeExtract {
  skills: string[];
  experience: { company: string; role: string; period?: string; highlights?: string[] }[];
  projects: { name: string; description?: string; tech?: string[] }[];
  education?: { institution: string; degree?: string; year?: string }[];
  summary?: string;
  /** Gemini's read on what this person would actually be interviewed for. */
  recommendedRole?: string;
  recommendedFocus?: string;
}

/* ── Interview (Phase 3) ────────────────────────────────────────────────── */

export const INTERVIEWER_PERSONAS = [
  "friendly",
  "professional",
  "challenging",
  "stress",
] as const;

export type InterviewerPersona = (typeof INTERVIEWER_PERSONAS)[number];

export const PERSONA_LABELS: Record<InterviewerPersona, string> = {
  friendly: "Friendly",
  professional: "Professional",
  challenging: "Challenging",
  stress: "Stress",
};

export const PERSONA_BLURBS: Record<InterviewerPersona, string> = {
  friendly: "Warm and encouraging. Gives you room to think.",
  professional: "Neutral and efficient. What a real first round feels like.",
  challenging: "Probes your answers and asks for specifics.",
  stress: "Interrupts, pushes back, and tests how you hold up.",
};

/** The four things an interview answer is judged on. All 0-100. */
export const ANSWER_DIMENSIONS = ["content", "clarity", "relevance", "structure"] as const;
export type AnswerDimension = (typeof ANSWER_DIMENSIONS)[number];
export type AnswerScores = Record<AnswerDimension, number>;

export const ANSWER_LABELS: Record<AnswerDimension, string> = {
  content: "Substance",
  clarity: "Clarity",
  relevance: "Relevance",
  structure: "Structure",
};

export const ANSWER_HINTS: Record<AnswerDimension, string> = {
  content: "Real specifics and evidence, not generalities",
  clarity: "Understandable the first time, without re-reading",
  relevance: "Actually answers the question that was asked",
  structure: "A shape a listener can follow to the end",
};

/**
 * Relevance is weighted highest because the most common interview failure is
 * a well-delivered answer to a question nobody asked.
 */
export const ANSWER_WEIGHTS: AnswerScores = {
  content: 0.3,
  clarity: 0.22,
  relevance: 0.3,
  structure: 0.18,
};

export type QuestionKind = "behavioural" | "technical" | "situational" | "motivational";

/* ── Group discussion & debate (Phase 4) ────────────────────────────────── */

export interface DiscussionPersona {
  id: string;
  name: string;
  trait: string;
  /** Shapes the system prompt, not the scoring. */
  instruction: string;
}

export interface GdMetrics {
  totalTurns: number;
  userTurns: number;
  userWords: number;
  totalWords: number;
  /** Share of all words spoken that were the user's, 0-100. */
  speakingSharePct: number;
  argumentsIntroduced: number;
  directRebuttals: number;
  interruptions: number;
}

/** Per-session settings that only some modes need. */
export interface SessionConfig {
  persona?: InterviewerPersona;
  questionCount?: number;
  role?: string;
  /** Debate: the side the user argues. The AI automatically takes the other. */
  userStance?: "for" | "against";
  personaIds?: string[];
}
