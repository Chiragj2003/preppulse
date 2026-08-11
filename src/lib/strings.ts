/**
 * Externalised UI strings — switching language needs no component edits.
 *
 * This is a thin record-lookup, not an i18n framework. No new library, no
 * runtime locale negotiation. Components call `t("key", lang)` and get the
 * right string for the session's language.
 *
 * Only session-facing strings are covered. Static marketing copy (landing
 * page, pricing) stays in English — the product's voice is English, and
 * Hinglish/Hindi apply to coaching and practice, not the shell.
 */
import type { Language } from "./types";

type StringKey = keyof typeof STRINGS;

const STRINGS = {
  // ── Practice flow ────────────────────────────────────────────────────
  start: {
    en: "I\u2019m ready",
    hinglish: "Main ready hoon",
    hi: "\u092E\u0948\u0902 \u0924\u0948\u092F\u093E\u0930 \u0939\u0942\u0901",
  },
  rollDaily: {
    en: "Roll today\u2019s topic",
    hinglish: "Aaj ka topic roll karo",
    hi: "\u0906\u091C \u0915\u093E \u091F\u0949\u092A\u093F\u0915 \u0930\u094B\u0932 \u0915\u0930\u0947\u0902",
  },
  rollQuick: {
    en: "Roll a topic",
    hinglish: "Ek topic roll karo",
    hi: "\u090F\u0915 \u091F\u0949\u092A\u093F\u0915 \u0930\u094B\u0932 \u0915\u0930\u0947\u0902",
  },
  prepHint: {
    en: "30 seconds to think / 2 minutes to talk",
    hinglish: "30 second sochne ke liye / 2 minute bolne ke liye",
    hi: "30 \u0938\u0947\u0915\u0902\u0921 \u0938\u094B\u091A\u0928\u0947 \u0915\u0947 \u0932\u093F\u090F / 2 \u092E\u093F\u0928\u091F \u092C\u094B\u0932\u0928\u0947 \u0915\u0947 \u0932\u093F\u090F",
  },
  quickHint: {
    en: "60 seconds / no prep",
    hinglish: "60 second / koi taiyaari nahi",
    hi: "60 \u0938\u0947\u0915\u0902\u0921 / \u0915\u094B\u0908 \u0924\u0948\u092F\u093E\u0930\u0940 \u0928\u0939\u0940\u0902",
  },

  // ── Score report ─────────────────────────────────────────────────────
  strengths: {
    en: "Strengths",
    hinglish: "Achi baatein",
    hi: "\u0905\u091A\u094D\u091B\u0940 \u092C\u093E\u0924\u0947\u0902",
  },
  improvements: {
    en: "To work on",
    hinglish: "Kaam karne wali cheezein",
    hi: "\u0938\u0941\u0927\u093E\u0930 \u0915\u0947 \u0932\u093F\u090F",
  },
  improvedAnswer: {
    en: "How it could sound",
    hinglish: "Ye aisa lag sakta tha",
    hi: "\u092F\u0939 \u0910\u0938\u0947 \u0939\u094B \u0938\u0915\u0924\u093E \u0925\u093E",
  },
  overallScore: {
    en: "Overall",
    hinglish: "Overall",
    hi: "\u0915\u0941\u0932 \u092E\u093F\u0932\u093E\u0915\u0930",
  },

  // ── Score dimension labels ───────────────────────────────────────────
  fluency: {
    en: "Fluency",
    hinglish: "Fluency",
    hi: "\u092A\u094D\u0930\u0935\u093E\u0939",
  },
  vocabulary: {
    en: "Vocabulary",
    hinglish: "Vocabulary",
    hi: "\u0936\u092C\u094D\u0926 \u091A\u092F\u0928",
  },
  structure: {
    en: "Structure",
    hinglish: "Structure",
    hi: "\u0938\u0902\u0930\u091A\u0928\u093E",
  },
  clarity: {
    en: "Clarity",
    hinglish: "Clarity",
    hi: "\u0938\u094D\u092A\u0937\u094D\u091F\u0924\u093E",
  },
  pace: {
    en: "Pace",
    hinglish: "Pace",
    hi: "\u0917\u0924\u093F",
  },
  fillerControl: {
    en: "Filler control",
    hinglish: "Filler control",
    hi: "\u092B\u093C\u093F\u0932\u0930 \u0928\u093F\u092F\u0902\u0924\u094D\u0930\u0923",
  },

  // ── Interview ────────────────────────────────────────────────────────
  submitAnswer: {
    en: "Submit answer",
    hinglish: "Jawab submit karo",
    hi: "\u0909\u0924\u094D\u0924\u0930 \u092D\u0947\u091C\u0947\u0902",
  },
  retryQuestion: {
    en: "Try again",
    hinglish: "Dobara try karo",
    hi: "\u0926\u094B\u092C\u093E\u0930\u093E \u092A\u094D\u0930\u092F\u093E\u0938 \u0915\u0930\u0947\u0902",
  },
  nextQuestion: {
    en: "Next question",
    hinglish: "Agla sawaal",
    hi: "\u0905\u0917\u0932\u093E \u0938\u0935\u093E\u0932",
  },
  finishInterview: {
    en: "Finish interview",
    hinglish: "Interview khatam karo",
    hi: "\u0907\u0902\u091F\u0930\u0935\u094D\u092F\u0942 \u0938\u092E\u093E\u092A\u094D\u0924 \u0915\u0930\u0947\u0902",
  },

  // ── Discussion / rooms ───────────────────────────────────────────────
  send: {
    en: "Send",
    hinglish: "Bhejo",
    hi: "\u092D\u0947\u091C\u0947\u0902",
  },
  finishDiscussion: {
    en: "Finish",
    hinglish: "Khatam karo",
    hi: "\u0938\u092E\u093E\u092A\u094D\u0924 \u0915\u0930\u0947\u0902",
  },
  typeMessage: {
    en: "Type your point\u2026",
    hinglish: "Apna point likho\u2026",
    hi: "\u0905\u092A\u0928\u093E \u092A\u0949\u0907\u0902\u091F \u0932\u093F\u0916\u0947\u0902\u2026",
  },

  // ── Settings ─────────────────────────────────────────────────────────
  settingsTitle: {
    en: "Settings",
    hinglish: "Settings",
    hi: "\u0938\u0947\u091F\u093F\u0902\u0917\u094D\u0938",
  },
  languageLabel: {
    en: "Language",
    hinglish: "Bhasha",
    hi: "\u092D\u093E\u0937\u093E",
  },
  languageHint: {
    en: "AI coaching and prompts will use this language.",
    hinglish: "AI coaching aur prompts is bhasha mein honge.",
    hi: "AI \u0915\u094B\u091A\u093F\u0902\u0917 \u0914\u0930 \u092A\u094D\u0930\u0949\u092E\u094D\u092A\u094D\u091F\u094D\u0938 \u0907\u0938 \u092D\u093E\u0937\u093E \u092E\u0947\u0902 \u0939\u094B\u0902\u0917\u0947\u0964",
  },
  saved: {
    en: "Saved",
    hinglish: "Save ho gaya",
    hi: "\u0938\u0947\u0935 \u0939\u094B \u0917\u092F\u093E",
  },
} as const;

/**
 * Look up a UI string by key and language. Falls back to English if the
 * key or language is missing — the product must never render undefined.
 */
export function t(key: StringKey, language: Language = "en"): string {
  const entry = STRINGS[key];
  return entry[language] ?? entry.en;
}

/**
 * All string keys, exported for tests or iteration.
 */
export const STRING_KEYS = Object.keys(STRINGS) as StringKey[];
