/**
 * Checks that the technologies picked at setup actually govern the questions.
 *
 *   npx tsx --env-file=.env scripts/verify-focus.ts
 *
 * The claim on the setup screen is "the technical questions will concentrate
 * here". That is a promise about model output, which is exactly the kind of
 * promise that quietly stops being true — so it is measured rather than
 * assumed: generate a set with focus areas, generate one without, and compare.
 *
 * Coverage is read off the validated `focusArea` tag, not off a substring
 * search of the question text. The first version of this script did search the
 * text and reported a failure for a set that was in fact on topic: a question
 * about re-architecting a write path under lock contention is a system-design
 * question that never contains the words "system design".
 */
import { generateQuestions } from "../src/lib/ai/interview";

const BACKGROUND = `Full stack engineer, three years. Built FocusFlow, a habit tracker, with
Next.js, React and Postgres. Worked on an internal analytics dashboard using Python, Pandas and
Airflow. Deployed everything on AWS with Docker and Terraform. Also wrote a small Redis-backed
rate limiter and a Kafka consumer for event ingestion. Comfortable with TypeScript, SQL tuning
and CI pipelines in GitHub Actions.`;

const FOCUS = ["Kubernetes", "Postgres", "System design"];
const COUNT = 8;

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set. Run with: npx tsx --env-file=.env");
  }

  console.log(`Focus areas: ${FOCUS.join(", ")}\n`);

  const focused = await generateQuestions({
    userId: "verify-script",
    sessionId: "00000000-0000-0000-0000-000000000000",
    persona: "professional",
    count: COUNT,
    role: "Backend Engineer",
    background: BACKGROUND,
    focusAreas: FOCUS,
  });

  const baseline = await generateQuestions({
    userId: "verify-script",
    sessionId: "00000000-0000-0000-0000-000000000000",
    persona: "professional",
    count: COUNT,
    role: "Backend Engineer",
    background: BACKGROUND,
  });

  const tagged = focused.filter((q) => q.focusArea !== null).length;
  const required = Math.max(FOCUS.length, Math.ceil(COUNT * 0.6));

  console.log("WITH focus areas:");
  for (const q of focused) {
    console.log(`  ${(q.focusArea ?? "—").padEnd(14)} [${q.kind}] ${q.question}`);
  }

  console.log("\nWITHOUT focus areas (no topics were requested, so no tags):");
  for (const q of baseline) {
    console.log(`  ${(q.focusArea ?? "—").padEnd(14)} [${q.kind}] ${q.question}`);
  }

  // Every chosen technology has to turn up at least once, and the count has to
  // hit the share the prompt asked for. Both are the promise the setup screen
  // makes out loud.
  const covered = FOCUS.filter((area) => focused.some((q) => q.focusArea === area));
  const untagged = baseline.every((q) => q.focusArea === null);

  console.log(
    `\nTagged   ${tagged}/${COUNT} questions (need ${required})` +
      `\nCoverage ${covered.length}/${FOCUS.length} areas (${covered.join(", ") || "none"})` +
      `\nBaseline tags cleared: ${untagged}`,
  );

  const ok =
    focused.length === COUNT &&
    baseline.length === COUNT &&
    tagged >= required &&
    covered.length === FOCUS.length &&
    untagged;

  console.log(
    ok
      ? "\nPASS — the picked technologies drive the question set."
      : "\nFAIL — focus areas are not steering the questions.",
  );
  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  console.error("\nFAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
