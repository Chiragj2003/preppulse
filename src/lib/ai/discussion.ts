import Groq from "groq-sdk";
import { z } from "zod";

import { env } from "@/lib/env";
import { GD_PERSONAS, MODERATOR, STAGE_BRIEF, type DebateStage } from "@/lib/gd-metrics";
import { toAppError } from "@/lib/errors";
import type { DiscussionPersona } from "@/lib/types";
import { recordUsage } from "./usage";

/**
 * Group discussion and debate run on Groq for the same reason Phase 2 does:
 * three participants have to answer inside a couple of seconds or the room
 * stops feeling live, and latency matters more here than depth.
 */
const MODELS = [
  process.env.GROQ_MODEL,
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
].filter((m): m is string => Boolean(m));

const ReplySchema = z.object({
  /** The model's read on the user's turn — judgement we then merely tally. */
  userTurn: z.object({
    isRebuttal: z.boolean(),
    introducesArgument: z.boolean(),
  }),
  replies: z
    .array(
      z.object({
        speaker: z.string(),
        content: z.string(),
        isRebuttal: z.boolean(),
      }),
    )
    .min(1)
    .max(4),
});

export interface Turn {
  speaker: string | null;
  content: string;
}

function transcriptOf(turns: Turn[], personas: DiscussionPersona[]): string {
  return turns
    .map((turn) => {
      const name =
        turn.speaker === null
          ? "CANDIDATE"
          : (personas.find((p) => p.id === turn.speaker)?.name ?? turn.speaker);
      return `${name}: ${turn.content}`;
    })
    .join("\n");
}

async function askGroq(args: {
  prompt: string;
  system: string;
  userId: string;
  sessionId: string;
  operation: string;
}) {
  const client = new Groq({ apiKey: env.groqApiKey, timeout: 45_000, maxRetries: 1 });
  let lastError: unknown;

  for (const model of MODELS) {
    const startedAt = Date.now();
    try {
      const completion = await client.chat.completions.create({
        model,
        temperature: 0.9, // personalities need variance; scoring does not
        max_tokens: 1200,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: args.system },
          { role: "user", content: args.prompt },
        ],
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) throw new Error("Groq returned an empty completion");

      const parsed = ReplySchema.safeParse(JSON.parse(content));
      if (!parsed.success) {
        throw new Error(`Groq returned unexpected JSON: ${parsed.error.issues[0]?.message}`);
      }

      await recordUsage({
        userId: args.userId,
        sessionId: args.sessionId,
        provider: "groq",
        model,
        operation: args.operation,
        inputTokens: completion.usage?.prompt_tokens ?? 0,
        outputTokens: completion.usage?.completion_tokens ?? 0,
        latencyMs: Date.now() - startedAt,
      });

      return parsed.data;
    } catch (error) {
      lastError = error;
      await recordUsage({
        userId: args.userId,
        sessionId: args.sessionId,
        provider: "groq",
        model,
        operation: args.operation,
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: Date.now() - startedAt,
        ok: false,
        errorCode: error instanceof Error ? error.message.slice(0, 120) : "unknown",
      });

      const status = (error as { status?: number })?.status;
      const message = error instanceof Error ? error.message : "";
      if (!(status === 404 || /decommission|does not exist|model_not_found/i.test(message))) break;
    }
  }

  throw toAppError(lastError, "groq.discussion");
}

/**
 * One call produces every participant's reaction to the user's turn.
 *
 * Asking each persona separately would be N round trips and they would all
 * talk past each other, because none would have seen what the others just
 * said. Generating the whole exchange together is both cheaper and the only
 * way the panel argues with itself as well as with the candidate.
 */
export async function respondToDiscussion(input: {
  userId: string;
  sessionId: string;
  topic: string;
  history: Turn[];
  userTurn: string;
  personaIds: string[];
  isOpening?: boolean;
}) {
  const personas = GD_PERSONAS.filter((p) => input.personaIds.includes(p.id));
  const cast = [...personas, MODERATOR];

  const roster = personas
    .map((p) => `- ${p.name} (id "${p.id}", ${p.trait}): ${p.instruction}`)
    .join("\n");

  const system =
    "You simulate a realistic group discussion panel. You always reply with a single valid JSON object and nothing else. Each participant speaks in their own voice and reacts to what was actually just said.";

  const prompt = `GROUP DISCUSSION TOPIC: ${input.topic}

THE PANEL (besides the candidate):
${roster}
- Moderator (id "moderator"): ${MODERATOR.instruction}

TRANSCRIPT SO FAR:
"""
${transcriptOf(input.history, cast).slice(-4000) || "(the discussion is just starting)"}
"""

THE CANDIDATE JUST SAID:
"""
${input.userTurn.slice(0, 3000)}
"""

Produce the next 2-3 turns of the discussion.

Rules:
- Speak as the panel, never as the candidate.
- React to the candidate's specific point. Quote or paraphrase it. Generic filler is a failure.
- Stay in character: Maya wants evidence, Rohan pushes hard, Aisha bridges, Vikram contradicts.
- Panelists may disagree with each other, not only with the candidate.
- Keep each turn to 2-3 sentences. This is speech, not an essay.
- Include the moderator only when the flow genuinely needs steering.
- "userTurn" is your assessment of what the CANDIDATE just said:
  isRebuttal = it directly answered a specific point someone made.
  introducesArgument = it added a new claim or angle not yet raised.

Return ONLY JSON:
{"userTurn":{"isRebuttal":boolean,"introducesArgument":boolean},"replies":[{"speaker":"<persona id>","content":string,"isRebuttal":boolean}]}`;

  return askGroq({
    prompt,
    system,
    userId: input.userId,
    sessionId: input.sessionId,
    operation: "discussion_turn",
  });
}

/**
 * Debate: a single opponent who automatically argues the opposite side, moving
 * through opening, argument, rebuttal and closing.
 */
export async function respondToDebate(input: {
  userId: string;
  sessionId: string;
  topic: string;
  userStance: "for" | "against";
  stage: DebateStage;
  history: Turn[];
  userTurn: string;
}) {
  const opponentStance = input.userStance === "for" ? "against" : "for";

  const system =
    "You are a sharp, disciplined debate opponent. You always reply with a single valid JSON object and nothing else.";

  const prompt = `DEBATE MOTION: ${input.topic}

The candidate is arguing ${input.userStance.toUpperCase()} the motion.
You are arguing ${opponentStance.toUpperCase()}. You never concede the motion.

CURRENT STAGE: ${input.stage} — ${STAGE_BRIEF[input.stage]}

TRANSCRIPT SO FAR:
"""
${transcriptOf(input.history, []).slice(-4000) || "(the debate is just starting)"}
"""

THE CANDIDATE JUST SAID:
"""
${input.userTurn.slice(0, 3000)}
"""

Give your ${input.stage} as the opposing side.

Rules:
- Engage their actual words. In the rebuttal stage, name and dismantle their strongest point specifically.
- Be forceful and well-reasoned. Never rude, never a strawman.
- 3-4 sentences. Spoken, not written.
- "userTurn" is your assessment of what the CANDIDATE just said:
  isRebuttal = it directly answered a point you made.
  introducesArgument = it added a new claim not yet raised.

Return ONLY JSON:
{"userTurn":{"isRebuttal":boolean,"introducesArgument":boolean},"replies":[{"speaker":"opponent","content":string,"isRebuttal":boolean}]}`;

  return askGroq({
    prompt,
    system,
    userId: input.userId,
    sessionId: input.sessionId,
    operation: "debate_turn",
  });
}
