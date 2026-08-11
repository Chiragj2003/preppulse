import type { DiscussionPersona, GdMetrics } from "./types";

/**
 * Group-discussion metrics, computed in code from the stored turns.
 *
 * Same rule as everywhere else in PrepPulse: anything countable is counted
 * here. Speaking share, turn counts and word totals are arithmetic. Whether a
 * turn *introduced an argument* or *rebutted someone* is a judgement, so the
 * model tags each turn as it happens and this file only tallies the tags.
 */

export interface TurnLike {
  speaker: string | null;
  content: string;
  isRebuttal: boolean;
  introducesArgument?: boolean;
  wordCount?: number;
}

export function countWordsIn(text: string): number {
  const matches = text.trim().match(/\b[\p{L}\p{N}']+\b/gu);
  return matches ? matches.length : 0;
}

export function computeGdMetrics(turns: TurnLike[]): GdMetrics {
  let userWords = 0;
  let totalWords = 0;
  let userTurns = 0;
  let argumentsIntroduced = 0;
  let directRebuttals = 0;

  for (const turn of turns) {
    const words = turn.wordCount ?? countWordsIn(turn.content);
    totalWords += words;

    // speaker === null means the user.
    if (turn.speaker === null) {
      userTurns += 1;
      userWords += words;
      if (turn.isRebuttal) directRebuttals += 1;
      if (turn.introducesArgument) argumentsIntroduced += 1;
    }
  }

  return {
    totalTurns: turns.length,
    userTurns,
    userWords,
    totalWords,
    speakingSharePct: totalWords === 0 ? 0 : Math.round((userWords / totalWords) * 100),
    argumentsIntroduced,
    directRebuttals,
    interruptions: 0,
  };
}

/**
 * A qualitative read on presence, from the share alone.
 *
 * The band matters: in a real group discussion, dominating is penalised as
 * heavily as staying silent, so the target is a fair slice rather than "more
 * is better". With N participants, an even split is 100/N — we allow a
 * generous window around it before calling someone quiet or domineering.
 */
export function presenceVerdict(
  sharePct: number,
  participantCount: number,
): { label: string; detail: string } {
  const even = 100 / Math.max(1, participantCount);

  if (sharePct < even * 0.45) {
    return {
      label: "Too quiet",
      detail: "You let the discussion happen around you. Get in earlier, even briefly.",
    };
  }
  if (sharePct > even * 1.9) {
    return {
      label: "Dominating",
      detail: "You held the floor a lot. In a real panel that reads as not listening.",
    };
  }
  return {
    label: "Well judged",
    detail: "You took a fair share of the airtime without crowding anyone out.",
  };
}

/* ── Personas ───────────────────────────────────────────────────────────── */

/**
 * Distinct enough that the user has to adapt: one wants evidence, one attacks,
 * one bridges, one contradicts on principle. A panel of agreeable participants
 * teaches nothing.
 */
export const GD_PERSONAS: DiscussionPersona[] = [
  {
    id: "maya",
    name: "Maya",
    trait: "data-driven",
    instruction:
      "You argue from evidence. You cite figures, studies and base rates, and you ask other speakers what their claim is actually based on. You are unimpressed by anecdote.",
  },
  {
    id: "rohan",
    name: "Rohan",
    trait: "aggressive",
    instruction:
      "You are forceful and competitive. You interrupt weak reasoning, restate your point louder, and push back hard. Never insulting, but you are trying to win the room.",
  },
  {
    id: "aisha",
    name: "Aisha",
    trait: "balanced",
    instruction:
      "You synthesise. You find what two disagreeing speakers actually share, name the trade-off, and bring quiet people in. You are the one who moves the group forward.",
  },
  {
    id: "vikram",
    name: "Vikram",
    trait: "contrarian",
    instruction:
      "You take the unpopular side on principle. Whatever consensus is forming, you probe its weakest assumption. You are provocative but genuinely argue the position.",
  },
];

export const MODERATOR: DiscussionPersona = {
  id: "moderator",
  name: "Moderator",
  trait: "moderator",
  instruction:
    "You run the discussion. You open it, keep it moving, bring in anyone who has been quiet, cut off anyone dominating, and close with a summary. You never take a side.",
};

export function personaById(id: string): DiscussionPersona | undefined {
  return [...GD_PERSONAS, MODERATOR].find((p) => p.id === id);
}

/* ── Debate ─────────────────────────────────────────────────────────────── */

export const DEBATE_STAGES = ["opening", "argument", "rebuttal", "closing"] as const;
export type DebateStage = (typeof DEBATE_STAGES)[number];

export const STAGE_BRIEF: Record<DebateStage, string> = {
  opening: "State your position and the ground you intend to fight on.",
  argument: "Make your strongest case. Evidence, not assertion.",
  rebuttal: "Take apart your opponent's best point directly.",
  closing: "Land it. What should the room remember?",
};

/** Debate always runs the four stages in order, so the next one is positional. */
export function nextStage(current: DebateStage): DebateStage | null {
  const index = DEBATE_STAGES.indexOf(current);
  return index === DEBATE_STAGES.length - 1 ? null : DEBATE_STAGES[index + 1];
}
