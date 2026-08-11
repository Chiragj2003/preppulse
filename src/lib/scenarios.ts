/**
 * Conversation and scenario definitions. Pure data plus two small helpers, so
 * the whole thing is unit testable without touching a model.
 *
 * These modes reuse the Phase 4 machinery wholesale: the same
 * `discussion_turns` table, the same `speak()` action, the same room UI. What
 * changes is the counterpart and the brief. Building a second turn engine for
 * "a conversation" would have been the same state machine with different
 * labels.
 */

export interface Counterpart {
  id: string;
  name: string;
  role: string;
  /** Shapes the system prompt. */
  instruction: string;
}

export interface Scenario {
  id: string;
  kind: "conversation" | "scenario";
  title: string;
  /** What the user is trying to achieve. Shown before they start. */
  objective: string;
  setting: string;
  counterpart: Counterpart;
  /** Concrete things a good performance does — used to score the session. */
  successLooksLike: string[];
  openingLine: string;
}

export const SCENARIOS: Scenario[] = [
  /* ── Conversation ────────────────────────────────────────────────────── */
  {
    id: "small-talk",
    kind: "conversation",
    title: "Small talk with a stranger",
    objective:
      "Keep a genuine conversation going for a few minutes without it dying or becoming an interview.",
    setting: "You're both waiting for a delayed flight at the gate.",
    counterpart: {
      id: "sam",
      name: "Sam",
      role: "a fellow passenger",
      instruction:
        "You are a friendly but ordinary stranger killing time. You have your own life, opinions and small frustrations, and you volunteer them unprompted. You are not interviewing anyone.",
    },
    successLooksLike: [
      "Asked something that opened the conversation up rather than closing it",
      "Offered something about yourself instead of only asking",
      "Picked up a thread the other person dropped",
    ],
    openingLine: "Three hours. I've read the same departures board about forty times now.",
  },
  {
    id: "networking",
    kind: "conversation",
    title: "Networking without being awkward",
    objective:
      "Make a real connection at an industry event and leave with a reason to follow up.",
    setting: "A crowded conference coffee break.",
    counterpart: {
      id: "priya",
      name: "Priya",
      role: "a senior engineer at another company",
      instruction:
        "You are experienced, slightly guarded, and have had four identical conversations already today. You warm up considerably to anyone who is specific and genuinely curious rather than transactional.",
    },
    successLooksLike: [
      "Got past job titles into something real",
      "Was specific rather than generic",
      "Created a natural reason to stay in touch",
    ],
    openingLine: "That last talk ran twenty minutes over, didn't it. Were you in it?",
  },

  /* ── Real-world scenarios ────────────────────────────────────────────── */
  {
    id: "workplace-pushback",
    kind: "scenario",
    title: "Pushing back on your manager",
    objective:
      "Tell your manager the deadline is not achievable, and land it without sounding like you're refusing.",
    setting: "A one-to-one. You have two weeks of work and five days of calendar.",
    counterpart: {
      id: "dan",
      name: "Dan",
      role: "your engineering manager",
      instruction:
        "You are under pressure from above and you committed to this date publicly. You are not unreasonable, but you push back on vagueness and you want options, not problems. You respect anyone who brings a concrete alternative.",
    },
    successLooksLike: [
      "Stated the constraint plainly, without apologising for it",
      "Brought an option rather than only a problem",
      "Held the position under pressure without becoming defensive",
    ],
    openingLine:
      "Before we get into anything else — we're still good for the 14th, right? I've told the client we are.",
  },
  {
    id: "angry-customer",
    kind: "scenario",
    title: "An angry customer",
    objective: "De-escalate a genuinely upset customer and get to a resolution.",
    setting: "A support call. Their order was lost, and this is the second time.",
    counterpart: {
      id: "marcus",
      name: "Marcus",
      role: "a customer who has been let down twice",
      instruction:
        "You are angry and you have a right to be. You interrupt, you bring up the previous failure, and you are not interested in scripted apologies. You calm down measurably when someone acknowledges the specific problem and commits to something concrete.",
    },
    successLooksLike: [
      "Acknowledged the actual problem before offering a fix",
      "Stayed calm without sounding scripted",
      "Committed to something specific and checkable",
    ],
    openingLine:
      "This is the second time. The SECOND time. I don't want another apology, I want to know what you're actually going to do.",
  },
  {
    id: "salary-negotiation",
    kind: "scenario",
    title: "Negotiating an offer",
    objective: "Ask for more than you were offered, and keep the relationship intact.",
    setting: "A call after receiving a written offer that came in low.",
    counterpart: {
      id: "elena",
      name: "Elena",
      role: "the hiring manager",
      instruction:
        "You want this candidate but you have a band and a budget. You test whether they can justify a number. You do not immediately say yes, and you respect a candidate who is specific about their value rather than apologetic or aggressive.",
    },
    successLooksLike: [
      "Named a number rather than hinting",
      "Justified it with something concrete",
      "Stayed warm while holding the ask",
    ],
    openingLine:
      "So, did you get a chance to look through the offer? I'd love to get you started next month.",
  },
];

export function scenarioById(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

export function scenariosOfKind(kind: "conversation" | "scenario"): Scenario[] {
  return SCENARIOS.filter((s) => s.kind === kind);
}

/**
 * Detects a counterpart that has stopped contributing and started prompting.
 *
 * The brief called this out specifically: an AI conversation partner that keeps
 * saying "tell me more about that" is the single thing that makes these modes
 * feel fake. It is also a failure the model reliably falls into, because
 * deflecting is always a safe reply.
 *
 * We can't stop the model producing one, but we can catch it and re-ask. This
 * is checked in code rather than trusted to the prompt, for the same reason
 * filler words are counted rather than judged.
 */
const DEFLECTIONS = [
  /\btell me more\b/i,
  /\bcan you (?:elaborate|expand)\b/i,
  /\bwhat (?:else|other)\b.*\?$/i,
  /\bthat'?s (?:interesting|great|fascinating)\b/i,
  /\bhow (?:did|does) that make you feel\b/i,
  /\bwould you like to (?:share|add)\b/i,
];

export function isDeflection(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return true;

  // A reply that is nothing but a question, and a short one, is a deflection
  // regardless of phrasing: the counterpart contributed nothing of their own.
  const sentences = trimmed.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const onlyQuestion = sentences.length === 1 && trimmed.endsWith("?") && trimmed.length < 80;

  return onlyQuestion || DEFLECTIONS.some((pattern) => pattern.test(trimmed));
}

/**
 * Contractions are expanded before comparison, otherwise "that's a fair point"
 * and "that is a fair point" share only half their words and a straight repeat
 * slips through as novel.
 */
const CONTRACTIONS: [RegExp, string][] = [
  [/\bn't\b/g, " not"],
  [/\b(\w+)'re\b/g, "$1 are"],
  [/\b(\w+)'ll\b/g, "$1 will"],
  [/\b(\w+)'ve\b/g, "$1 have"],
  [/\b(\w+)'m\b/g, "$1 am"],
  [/\b(\w+)'d\b/g, "$1 would"],
  [/\b(\w+)'s\b/g, "$1 is"],
];

function normalise(text: string): string {
  let out = text.toLowerCase();
  out = out.replace(/n't\b/g, " not");
  for (const [pattern, replacement] of CONTRACTIONS) {
    out = out.replace(pattern, replacement);
  }
  return out.replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

/** True when the counterpart is repeating itself across recent turns. */
export function isRepetitive(candidate: string, recent: string[]): boolean {
  const target = normalise(candidate);
  if (target.length === 0) return true;

  return recent.some((previous) => {
    const other = normalise(previous);
    if (other.length === 0) return false;
    if (other === target) return true;

    // Jaccard overlap on word sets: catches a rephrasing of the same reply.
    const a = new Set(target.split(/\s+/));
    const b = new Set(other.split(/\s+/));
    const shared = [...a].filter((w) => b.has(w)).length;
    const union = new Set([...a, ...b]).size;
    return union > 0 && shared / union > 0.6;
  });
}
