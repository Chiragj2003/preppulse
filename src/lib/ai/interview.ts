import { z } from "zod";

import { AppError } from "@/lib/errors";
import { difficultyBreakdown, weightedAnswerScore } from "@/lib/interview-scoring";
import { clamp } from "@/lib/scoring";
import type {
  AnswerScores,
  Difficulty,
  InterviewerPersona,
  Language,
  QuestionKind,
  ResumeExtract,
} from "@/lib/types";
import { callGemini, type GeminiPart } from "./gemini";
import { callAI } from "./provider";

const LANGUAGE_NOTE: Record<Language, string> = {
  en: "Reply in English.",
  hinglish:
    "The candidate may answer in Hinglish (Hindi-English mix). Judge on communication, not language purity. Reply in Hinglish.",
  hi: "The candidate may answer in Hindi. Reply in Hindi.",
};

/* ── Resume extraction ──────────────────────────────────────────────────── */

const ResumeSchema = z.object({
  skills: z.array(z.string()).max(40),
  experience: z
    .array(
      z.object({
        company: z.string(),
        role: z.string(),
        period: z.string().optional(),
        highlights: z.array(z.string()).optional(),
      }),
    )
    .max(12),
  projects: z
    .array(
      z.object({
        name: z.string(),
        description: z.string().optional(),
        tech: z.array(z.string()).optional(),
      }),
    )
    .max(12),
  education: z
    .array(
      z.object({
        institution: z.string(),
        degree: z.string().optional(),
        year: z.string().optional(),
      }),
    )
    .optional(),
  summary: z.string().optional(),
  recommendedRole: z.string(),
  recommendedFocus: z.string(),
});

/**
 * Reads the PDF natively — Gemini accepts the bytes directly, so there is no
 * OCR step and no text-extraction library to keep alive.
 *
 * The file itself is never persisted. Only this JSON is stored, which is both
 * the privacy position and the reason the profile row stays small.
 *
 * Always Gemini, regardless of AI_PROVIDER. Groq and OpenRouter's free tier
 * are chat-completions APIs — text in, text out — with nowhere to put raw PDF
 * bytes; only Gemini reads a document natively among the three. There is no
 * honest fallback here, so it doesn't get a dishonest one (see gemini.ts).
 */
export async function extractResume(input: {
  userId: string;
  pdfBase64: string;
}): Promise<ResumeExtract> {
  const parts: GeminiPart[] = [
    { inline_data: { mime_type: "application/pdf", data: input.pdfBase64 } },
    {
      text: `Extract this resume into JSON.

Rules:
- Copy what the document actually says. Do not invent employers, dates or metrics.
- If a field is genuinely absent, omit it rather than guessing.
- "recommendedRole" is the job title this person would realistically be interviewed for right now, based on what they have actually done.
- "recommendedFocus" is one sentence on what their interview would concentrate on.

Return ONLY JSON:
{"skills":string[],"experience":[{"company":string,"role":string,"period":string,"highlights":string[]}],"projects":[{"name":string,"description":string,"tech":string[]}],"education":[{"institution":string,"degree":string,"year":string}],"summary":string,"recommendedRole":string,"recommendedFocus":string}`,
    },
  ];

  return callGemini({
    parts,
    schema: ResumeSchema,
    operation: "extract_resume",
    userId: input.userId,
    temperature: 0.1,
    maxOutputTokens: 4096,
  });
}

/* ── Question generation ────────────────────────────────────────────────── */

/** Same tolerance as the answer schema — an unexpected `kind` string must not
 *  cost the candidate the entire question set. */
const QuestionsSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z.string(),
        kind: z
          .enum(["behavioural", "technical", "situational", "motivational"])
          .catch("behavioural"),
        rationale: z.string().catch(""),
        /** Which chosen technology this question tests, if any. Validated below. */
        focusArea: z.string().nullish().catch(null),
      }),
    )
    .min(1),
});

/**
 * Every question the model must write, one row per slot, computed entirely
 * in code from `difficultyBreakdown` before the prompt is built.
 *
 * The model is told which difficulty belongs at which position and asked to
 * fill it — it is not asked to self-report a difficulty and trusted. Difficulty
 * is a quota, not a judgement call, and quotas belong in code: a model-reported
 * label can drift from what was actually asked for, and nothing downstream
 * would ever notice. Assigning by position after the fact means the stored
 * distribution is exactly right by construction, every time.
 */
function difficultySlots(breakdown: { easy: number; medium: number; hard: number }): Difficulty[] {
  return [
    ...Array<Difficulty>(breakdown.easy).fill("easy"),
    ...Array<Difficulty>(breakdown.medium).fill("medium"),
    ...Array<Difficulty>(breakdown.hard).fill("hard"),
  ];
}

const PERSONA_VOICE: Record<InterviewerPersona, string> = {
  friendly:
    "You are warm and encouraging. Questions are open and give the candidate room to think.",
  professional:
    "You are neutral, efficient and businesslike. Questions are the ones a competent first-round interviewer would actually ask.",
  challenging:
    "You probe for specifics. Questions push for evidence, numbers and the candidate's exact contribution.",
  stress:
    "You are deliberately demanding. Questions are pointed, assume the candidate is overstating, and test composure. Stay professional — pressure, never rudeness.",
};

/**
 * The full set is produced in one call, before the interview starts.
 *
 * Generating each question after seeing the previous answer would be the
 * obvious design and is the wrong one: it makes a session impossible to
 * resume, and it lets the interview drift toward whatever the candidate is
 * comfortable with instead of covering the ground the role needs.
 */
export async function generateQuestions(input: {
  userId: string;
  sessionId: string;
  persona: InterviewerPersona;
  count: number;
  role: string;
  background: string;
  /**
   * Whether the background text above is even relevant to this round.
   *
   * Off is for someone who wants to drill a language or framework in the
   * general case — "ask me C# and JavaScript basics" — without the round
   * turning into an audit of their own resume. It changes what gets sent to
   * the model, not just an instruction the model can quietly ignore: with
   * this off, `background` is never included in the prompt at all.
   */
  useBackground: boolean;
  /** Technologies the candidate chose at setup. Empty means cover the background broadly. */
  focusAreas?: string[];
  language?: Language;
}) {
  const focus = (input.focusAreas ?? []).filter((area) => area.trim().length > 0);
  const slots = difficultySlots(difficultyBreakdown(input.count));

  // With no background in play, the focus list is the only thing left to
  // write questions about — so it drives every question, not merely most of
  // them. With a background, it still gets the weighted majority it always
  // has: the candidate named these topics on purpose.
  const focusedCount =
    focus.length === 0
      ? 0
      : input.useBackground
        ? Math.max(focus.length, Math.ceil(input.count * 0.6))
        : input.count;

  const focusRule =
    focus.length > 0
      ? `\nTHE CANDIDATE ASKED TO BE TESTED ON: ${focus.join(", ")}
- At least ${Math.min(focusedCount, input.count)} of the ${input.count} questions must be squarely about those topics, and every one of them must be covered at least once.
- Go past definitions. Ask about trade-offs, failure modes, and how a real decision gets made — the things someone who has actually used it can answer and someone who has only read about it cannot.
${input.useBackground ? "- The remaining questions cover the rest of their background as usual." : ""}
- Set "focusArea" to the exact topic string from that list when a question tests it, and null otherwise. Copy the string exactly — it is matched, not read.\n`
      : "";

  const difficultyRule = `\nEach question has a required difficulty, in this exact order — write question 1 to match slot 1, question 2 to match slot 2, and so on:
${slots.map((tier, i) => `${i + 1}. ${tier}`).join("\n")}
- easy: a single well-known concept: a definition, a common API, a basic distinction. Answerable in a sentence or two by anyone who has genuinely used this.
- medium: requires connecting two things, or a "how would you" that has more than one reasonable answer.
- hard: trade-offs, failure modes, or a scenario with a wrong-seeming right answer. Not just "the same thing but more obscure" — genuinely requires judgement.
- "Not that hard" only holds if the earlier slots are actually easy. A round that opens hard has failed regardless of what the later questions look like.\n`;

  const backgroundBlock = input.useBackground
    ? `The candidate's background:
"""
${input.background.slice(0, 6000)}
"""
`
    : `This candidate asked for general practice, not a review of their own history. Do NOT reference any project, employer, dataset, metric, or personal detail — even if some appear below, they are off-limits for this round. Write the kind of question a textbook or a course quiz would ask: about the technology itself, not about what this specific person has done with it.
${input.background ? `(For your own context only, never to be referenced: ${input.background.slice(0, 400)})` : ""}
`;

  const result = await callAI({
    prompt: `You are conducting a mock job interview for: ${input.role}

${PERSONA_VOICE[input.persona]}

${backgroundBlock}${focusRule}${difficultyRule}
Write exactly ${input.count} interview questions for this specific person.

Rules:
${input.useBackground ? "- Ground them in the background above. Reference their actual projects, tools and claims.\n" : ""}- Open with something answerable to settle nerves, then go deeper — the difficulty order above already does this; don't undercut it with a hard opener.
- Mix kinds: behavioural, technical, situational, motivational. Weight toward what this role really tests.
- One question each. No multi-part questions with "and also".
- Never ask "tell me about yourself" — it is the one question everyone has already rehearsed.
- "rationale" is one short line on why this question is worth asking THIS candidate.

${LANGUAGE_NOTE[input.language ?? "en"]}

Return ONLY JSON:
{"questions":[{"question":string,"kind":"behavioural"|"technical"|"situational"|"motivational","rationale":string,"focusArea":string|null}]}`,
    schema: QuestionsSchema,
    // This mode's own provider before AI_PROVIDER existed — see provider.ts.
    defaultProvider: "gemini",
    operation: "generate_questions",
    userId: input.userId,
    sessionId: input.sessionId,
    temperature: 0.85,
    maxOutputTokens: 4096,
  });

  // The tag is matched against what the candidate actually chose rather than
  // trusted. A model that invents a focus area, or tags a topic nobody asked
  // for, would otherwise turn a countable promise back into a vague one.
  const allowed = new Map(focus.map((area) => [area.toLowerCase(), area]));

  return result.questions.slice(0, input.count).map((q, index) => ({
    position: index,
    question: q.question,
    kind: q.kind as QuestionKind,
    // Positional, not the model's own label — see difficultySlots.
    difficulty: slots[index] ?? "medium",
    rationale: q.rationale,
    focusArea: q.focusArea ? (allowed.get(q.focusArea.trim().toLowerCase()) ?? null) : null,
  }));
}

/* ── Per-answer analysis ────────────────────────────────────────────────── */

/**
 * Be liberal in what you accept from a model.
 *
 * The strict version of this schema rejected a whole answer whenever Gemini
 * returned four strengths instead of three, or "85" instead of 85 — and a
 * rejected answer means the candidate loses work they just spoke for two
 * minutes. Formatting variance is the model's normal behaviour, not an error
 * worth destroying user data over.
 *
 * Counts are trimmed after parsing instead of being enforced during it.
 */
const looseNumber = z.preprocess((value) => {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/[^\d.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}, z.number());

/** Accepts a string array, a bare string, or objects carrying a text field. */
const looseStringArray = z.preprocess((value) => {
  const items = Array.isArray(value) ? value : value == null ? [] : [value];
  return items
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        const candidate = record.text ?? record.point ?? record.value ?? record.description;
        if (typeof candidate === "string") return candidate;
      }
      return "";
    })
    .filter((s) => s.trim().length > 0);
}, z.array(z.string()));

const AnswerSchema = z.object({
  content: looseNumber,
  clarity: looseNumber,
  relevance: looseNumber,
  structure: looseNumber,
  feedback: z.string().catch(""),
  strengths: looseStringArray,
  improvements: looseStringArray,
  idealAnswer: z.string().catch(""),
});

/**
 * Scores one answer against one question. Pure with respect to *when* it
 * runs — the interview room calls this once per question in a batch after
 * the whole session is over, not live after each answer.
 *
 * That is a reversal of the original design, which scored live so a candidate
 * who rambled on question 3 would find out before question 4. In practice
 * that meant every "next question" click sat behind a model call — the
 * candidate loses their conversational momentum waiting on a network request
 * between each answer, in a mode whose whole point is momentum. Deferring the
 * judgement to the end keeps the interview itself uninterrupted; see
 * `analyseSession` in app/interview/actions.ts for the batch that calls this
 * once per question after the candidate is done answering.
 */
export async function analyseAnswer(input: {
  userId: string;
  sessionId: string;
  question: string;
  kind: QuestionKind;
  transcript: string;
  persona: InterviewerPersona;
  role: string;
  language?: Language;
}) {
  const words = input.transcript.trim().split(/\s+/).filter(Boolean).length;
  if (words < 10) {
    throw new AppError(
      "invalid_input",
      "That answer is too short to judge fairly. Give it another go with a bit more.",
    );
  }

  const star =
    input.kind === "behavioural"
      ? "Because this is a behavioural question, the ideal answer MUST follow STAR: Situation, Task, Action, Result — with a concrete result."
      : "Give a strong model answer appropriate to the question type.";

  const verdict = await callAI({
    prompt: `You are assessing one answer in a mock interview for: ${input.role}

QUESTION (${input.kind}): ${input.question}

CANDIDATE'S ANSWER (speech-to-text, so expect missing punctuation):
"""
${input.transcript.slice(0, 6000)}
"""

Score 0-100 on four dimensions. Be fair but honest: 50 is an average attempt, 75 is genuinely good, above 90 is rare.
- content: real specifics and evidence, versus generalities
- clarity: understandable first time
- relevance: does it actually answer THIS question
- structure: does it have a shape a listener can follow

Then write:
- feedback: two sentences, second person, on how that answer would have landed in a real room.
- strengths: 1-3 specific things they did well. Quote their words where you can.
- improvements: 1-3 fixes, and each one MUST contain the actual missing content, not just an instruction to elaborate. "Be more specific about your optimization" is not acceptable — it tells them a gap exists without telling them what goes in it, and they cannot use that to answer better next time.
  Name the real thing: the specific technique, term, or fact a strong answer would have included. If they said "I optimized the query" without saying how, your bullet supplies the how — e.g. "Name the actual fix: an index on the join column, or replacing repeated lookups with a single JOIN instead of N+1 queries." If they mentioned joins but not which kind or why, say which kind and why: "State which join you used and why — an INNER JOIN if unmatched rows should be dropped, a LEFT JOIN if the left side must be preserved even with no match."
  Write it so the candidate could paste your bullet into their next attempt almost verbatim. If you cannot name the specific missing content because the transcript genuinely gives no hook to hang it on, say what a strong answer to this exact question would have included instead — never leave a bullet that only says something was missing.
- idealAnswer: a model answer to this question, written in first person as if the candidate gave it. ${star} Use their real background where the transcript gives you something to work with, and keep it to a spoken length — around 150 words.

${LANGUAGE_NOTE[input.language ?? "en"]}

Return ONLY JSON:
{"content":number,"clarity":number,"relevance":number,"structure":number,"feedback":string,"strengths":string[],"improvements":string[],"idealAnswer":string}`,
    schema: AnswerSchema,
    // This mode's own provider before AI_PROVIDER existed — see provider.ts.
    defaultProvider: "gemini",
    operation: "analyse_answer",
    userId: input.userId,
    sessionId: input.sessionId,
    temperature: 0.3,
    // Headroom. A truncated response is invalid JSON, which fails at
    // JSON.parse before the schema ever sees it — and the ideal answer is the
    // longest field, so it is what gets cut first.
    maxOutputTokens: 3072,
  });

  const scores: AnswerScores = {
    content: clamp(verdict.content),
    clarity: clamp(verdict.clarity),
    relevance: clamp(verdict.relevance),
    structure: clamp(verdict.structure),
  };

  // Trimmed here rather than enforced in the schema, so an over-eager model
  // costs the candidate nothing.
  const strengths = verdict.strengths.slice(0, 3);
  const improvements = verdict.improvements.slice(0, 3);

  return {
    scores,
    overallScore: weightedAnswerScore(scores),
    feedback: verdict.feedback || "That answer has been scored — see the breakdown below.",
    strengths: strengths.length > 0 ? strengths : ["You gave a complete answer to the question."],
    improvements:
      improvements.length > 0 ? improvements : ["Add one concrete example with a result."],
    idealAnswer: verdict.idealAnswer,
  };
}

// Pure maths lives in lib/interview-scoring.ts so it can be tested without
// pulling in the Gemini client and its env requirements.
export { aggregateScores, runningAverage, weightedAnswerScore } from "@/lib/interview-scoring";
