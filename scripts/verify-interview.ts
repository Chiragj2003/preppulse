/**
 * End-to-end check of interview scoring against the real Gemini API.
 *
 *   npx tsx --env-file=.env scripts/verify-interview.ts
 *
 * This is the path that was throwing "Gemini returned unexpected JSON: Invalid
 * input" and losing the candidate's answer. It runs a long, rambling answer —
 * the kind that provoked the failure — through analyseAnswer several times,
 * because the failure was intermittent and depended on how many strengths the
 * model felt like returning.
 */
import { analyseAnswer } from "../src/lib/ai/interview";

const QUESTION =
  "What inspired you to build your FocusFlow habit tracker using Next.js and React?";

/** Deliberately long and meandering, like a real spoken answer. */
const ANSWER = `So basically I built FocusFlow because I had this problem myself where I would
start habits and then drop them after like four or five days, and I tried a bunch of the apps
out there and they all felt kind of the same, you know, they just give you a checkbox and a
streak counter and that's it. And I thought the interesting part isn't the checkbox, it's why
you stopped. So I wanted to build something that asked you a question when you missed a day
instead of just breaking your streak and making you feel bad about it. I picked Next.js because
I wanted server components so the habit data query happens on the server and the page just
arrives with the data already in it, which mattered because I was checking it on my phone on
mobile data. And I used React obviously with that. I also used Postgres for storage. The hardest
part was actually the streak logic because of timezones, if you complete a habit at 1am your
local time that should count as that day not the next UTC day, and I got that wrong twice before
I figured it out. It's got about forty users now, mostly friends, and the retention after week
one is around sixty percent which is better than I expected honestly.`;

async function once(attempt: number) {
  const started = Date.now();
  const result = await analyseAnswer({
    userId: "verify-script",
    sessionId: "00000000-0000-0000-0000-000000000000",
    question: QUESTION,
    kind: "motivational",
    transcript: ANSWER,
    persona: "professional",
    role: "Full Stack AI Engineer",
  });

  const elapsed = Date.now() - started;
  const ok =
    Number.isFinite(result.overallScore) &&
    result.overallScore >= 0 &&
    result.overallScore <= 100 &&
    result.strengths.length > 0 &&
    result.strengths.length <= 3 &&
    result.improvements.length > 0 &&
    result.improvements.length <= 3 &&
    result.feedback.length > 0;

  console.log(
    `  ${ok ? "PASS" : "FAIL"}  attempt ${attempt}  ${String(elapsed).padStart(5)}ms  ` +
      `score=${result.overallScore}  strengths=${result.strengths.length}  ` +
      `improvements=${result.improvements.length}  idealAnswer=${result.idealAnswer.length} chars`,
  );

  if (attempt === 1) {
    console.log(`\n  Sample feedback: ${result.feedback}\n`);
    console.log(`  Sample ideal answer opening: ${result.idealAnswer.slice(0, 160)}...\n`);
  }

  return ok;
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set. Run with: npx tsx --env-file=.env");
  }

  console.log("Scoring a long rambling answer 3 times (the failure was intermittent):\n");

  let failures = 0;
  for (let i = 1; i <= 3; i++) {
    try {
      if (!(await once(i))) failures++;
    } catch (error) {
      failures++;
      console.log(`  FAIL  attempt ${i}  ${error instanceof Error ? error.message : error}`);
    }
  }

  console.log(
    failures === 0
      ? "\nInterview scoring survives real model output."
      : `\n${failures} of 3 attempts failed.`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("\nFAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
