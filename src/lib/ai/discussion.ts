import Groq from "groq-sdk";
import { z } from "zod";

import { env } from "@/lib/env";
import { GD_PERSONAS, MODERATOR, STAGE_BRIEF, type DebateStage } from "@/lib/gd-metrics";
import { toAppError } from "@/lib/errors";
import { isDeflection, isRepetitive, type Scenario } from "@/lib/scenarios";
import type { DiscussionPersona, Language } from "@/lib/types";
import { recordUsage } from "./usage";

const LANGUAGE_NOTE: Record<Language, string> = {
  en: "Reply in English.",
  hinglish:
    "The candidate may mix Hindi and English (Hinglish). Match their register. Reply in Hinglish.",
  hi: "The candidate may speak Hindi. Reply in Hindi.",
};

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
  language?: Language;
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

${LANGUAGE_NOTE[input.language ?? "en"]}

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
 * Conversation and scenario role-play.
 *
 * Reuses everything: the same Groq client, the same reply schema, the same
 * turn table and room UI as group discussion. Only the counterpart and the
 * brief change.
 *
 * The one addition is a re-ask. If the reply is a deflection ("tell me more")
 * or a rephrasing of something the counterpart already said, we ask once more
 * with an explicit instruction naming the failure. Deflecting is always the
 * safe reply for a model, which is exactly why it needs catching in code
 * rather than being hoped away in the prompt.
 */
export async function respondToScenario(input: {
  userId: string;
  sessionId: string;
  scenario: Scenario;
  history: Turn[];
  userTurn: string;
  language?: Language;
}) {
  const { scenario } = input;
  const counterpart = scenario.counterpart;

  const system = `You are ${counterpart.name}, ${counterpart.role}. ${counterpart.instruction}

You are a person in a conversation, not an assistant. You have your own view, your own stake in this, and your own things to say. You always reply with a single valid JSON object and nothing else.`;

  const recentReplies = input.history
    .filter((turn) => turn.speaker !== null)
    .slice(-4)
    .map((turn) => turn.content);

  const build = (extra = "") => `SETTING: ${scenario.setting}

TRANSCRIPT SO FAR:
"""
${transcriptOf(input.history, []).slice(-4000) || `(you have just said: "${scenario.openingLine}")`}
"""

THEY JUST SAID:
"""
${input.userTurn.slice(0, 3000)}
"""

Reply as ${counterpart.name}.

Rules:
- Say something of your own. React, disagree, add a detail, raise a concern, change your mind.
- NEVER reply with only a question. NEVER say "tell me more", "that's interesting", "can you elaborate", or ask how something made them feel. A question is fine only after you have contributed something.
- Do not repeat a point you have already made. Move the conversation somewhere new.
- 2-3 sentences. Spoken, not written. Contractions, not formality.
- Stay in character even if they say something odd.
${extra}
- "userTurn" is your assessment of what THEY just said:
  isRebuttal = it directly responded to your last point.
  introducesArgument = it moved things forward with something new.

${LANGUAGE_NOTE[input.language ?? "en"]}

Return ONLY JSON:
{"userTurn":{"isRebuttal":boolean,"introducesArgument":boolean},"replies":[{"speaker":"${counterpart.id}","content":string,"isRebuttal":boolean}]}`;

  let result = await askGroq({
    prompt: build(),
    system,
    userId: input.userId,
    sessionId: input.sessionId,
    operation: "scenario_turn",
  });

  const first = result.replies[0]?.content ?? "";

  if (isDeflection(first) || isRepetitive(first, recentReplies)) {
    console.warn("[scenario] counterpart deflected or repeated; re-asking once");
    result = await askGroq({
      prompt: build(
        `- Your previous attempt was rejected because it ${isDeflection(first) ? "was a deflection with no content of your own" : "repeated something you already said"}. Say something genuinely new and take a position.`,
      ),
      system,
      userId: input.userId,
      sessionId: input.sessionId,
      operation: "scenario_turn_retry",
    });
  }

  // One retry only. A second failure ships the reply anyway rather than
  // spending the user's rate limit chasing perfection mid-conversation.
  return result;
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
  language?: Language;
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

${LANGUAGE_NOTE[input.language ?? "en"]}

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
