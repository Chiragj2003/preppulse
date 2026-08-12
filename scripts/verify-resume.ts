/**
 * End-to-end check of the resume path: build a real PDF, send it to Gemini,
 * validate the extracted JSON against the same zod schema the app uses.
 *
 *   npx tsx --env-file=.env scripts/verify-resume.ts
 *
 * This exercises the genuinely risky part - native PDF parsing by the model -
 * without needing a browser file picker. If this passes, the only untested
 * step left is the file input itself.
 */
import { extractResume } from "../src/lib/ai/interview";

/**
 * A minimal but structurally valid PDF, written by hand.
 *
 * No pdf library: we need one throwaway document, and the format's Hello-World
 * is a handful of objects plus an xref table. Text is drawn with Tj operators
 * so Gemini receives real extractable text rather than an image.
 */
function buildPdf(lines: string[]): Buffer {
  const escaped = lines.map((l) => l.replace(/([()\\])/g, "\\$1"));

  const content =
    "BT\n/F1 11 Tf\n1 0 0 1 54 760 Tm\n14 TL\n" +
    escaped.map((l) => `(${l}) Tj T*`).join("\n") +
    "\nET";

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];

  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefAt = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;

  return Buffer.from(pdf, "latin1");
}

const RESUME = [
  "PRIYA SHARMA",
  "Bengaluru, India | priya.sharma@example.com | github.com/priyasharma",
  "",
  "SUMMARY",
  "Final-year Computer Science student. Frontend-leaning full-stack developer",
  "with production experience on a college fest platform used by 2,000 students.",
  "",
  "SKILLS",
  "JavaScript, TypeScript, React, Next.js, Node.js, Python, PostgreSQL, Docker, Git",
  "",
  "EXPERIENCE",
  "Frontend Developer Intern - Zeta Systems (Jun 2025 - Dec 2025)",
  "  Rebuilt the customer dashboard in React, cutting first paint from 4.1s to 1.3s.",
  "  Added an end-to-end test suite that caught 23 regressions before release.",
  "",
  "Teaching Assistant - PES University (Jan 2025 - May 2025)",
  "  Ran weekly lab sessions on data structures for 60 second-year students.",
  "",
  "PROJECTS",
  "FestFlow - Event platform for a college fest. Next.js, Postgres, Razorpay.",
  "  Handled 2,000 signups and 400 concurrent users on launch night.",
  "JobScraper - Python tool that aggregates listings from 5 job boards into one feed.",
  "",
  "EDUCATION",
  "B.Tech Computer Science, PES University, 2026. CGPA 8.7/10.",
];

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set. Run with: npx tsx --env-file=.env");
  }

  const pdf = buildPdf(RESUME);
  console.log(`Built a ${pdf.byteLength}-byte PDF with ${RESUME.length} lines.\n`);

  const started = Date.now();
  const result = await extractResume({
    // A real user id would write an ai_usage row; this is a throwaway run.
    userId: "verify-script",
    pdfBase64: pdf.toString("base64"),
  });
  const elapsed = Date.now() - started;

  console.log(`Gemini responded in ${elapsed}ms and the JSON validated.\n`);

  const checks: [string, boolean, string][] = [
    ["skills extracted", result.skills.length >= 5, `${result.skills.length} skills`],
    [
      "found React/TypeScript",
      result.skills.some((s) => /react|typescript/i.test(s)),
      result.skills.slice(0, 6).join(", "),
    ],
    ["experience extracted", result.experience.length >= 2, `${result.experience.length} roles`],
    [
      "employer read correctly",
      result.experience.some((e) => /zeta/i.test(e.company)),
      result.experience.map((e) => `${e.role} @ ${e.company}`).join(" | "),
    ],
    ["projects extracted", result.projects.length >= 2, result.projects.map((p) => p.name).join(", ")],
    ["role recommended", Boolean(result.recommendedRole), result.recommendedRole ?? "-"],
    ["focus recommended", Boolean(result.recommendedFocus), result.recommendedFocus ?? "-"],
  ];

  let failed = 0;
  for (const [label, ok, detail] of checks) {
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label.padEnd(24)} ${detail}`);
    if (!ok) failed++;
  }

  // The extraction prompt forbids invention. A hallucinated employer is worse
  // than a missing field, so check nothing appeared that wasn't in the source.
  const sourceText = RESUME.join(" ").toLowerCase();
  const invented = result.experience.filter(
    (e) => !sourceText.includes(e.company.toLowerCase().split(" ")[0]),
  );
  console.log(
    `  ${invented.length === 0 ? "PASS" : "FAIL"}  ${"no invented employers".padEnd(24)} ${
      invented.length === 0 ? "all companies appear in the source" : invented.map((e) => e.company).join(", ")
    }`,
  );
  if (invented.length > 0) failed++;

  console.log(`\n${failed === 0 ? "Resume extraction works end to end." : `${failed} check(s) failed.`}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("\nFAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
