import type { Difficulty } from "@/lib/types";

/**
 * Seed pieces for reading practice.
 *
 * Two shapes, two jobs:
 *
 * A **tongue twister** drills one articulation problem at a time — a consonant
 * contrast your mouth wants to collapse. The pace band is deliberately slow,
 * because the failure mode is rushing, and a twister read fast and wrong is
 * worth less than one read slowly and right.
 *
 * A **passage** drills sustained delivery: keeping pace, phrasing and clarity
 * over a paragraph rather than a phrase. These are original text or long out of
 * copyright, and each is written to be *sayable* — no tongue-defeating proper
 * nouns, no sentence that runs out of breath.
 *
 * Every piece names what it drills, so the report can say "this was the s/sh
 * contrast" instead of just handing back a number.
 */
export interface SeedReadingPiece {
  kind: "tongue_twister" | "passage";
  difficulty: Difficulty;
  title: string;
  body: string;
  focus: string;
  paceMin: number;
  paceMax: number;
}

/** Twisters are scored slow on purpose — see the note above. */
const TWISTER_PACE = { paceMin: 90, paceMax: 120 };
const PASSAGE_PACE = { paceMin: 140, paceMax: 170 };

export const SEED_READING_PIECES: SeedReadingPiece[] = [
  /* ── Tongue twisters: consonant contrasts ─────────────────────────────── */
  {
    kind: "tongue_twister",
    difficulty: "easy",
    title: "Sea shells",
    body: "She sells sea shells by the sea shore. The shells she sells are surely sea shells.",
    focus: "The s and sh contrast — the pair that collapses first when you speed up.",
    ...TWISTER_PACE,
  },
  {
    kind: "tongue_twister",
    difficulty: "easy",
    title: "Peter Piper",
    body: "Peter Piper picked a peck of pickled peppers. A peck of pickled peppers Peter Piper picked.",
    focus: "Plosive p — keeping each one crisp instead of letting them blur together.",
    ...TWISTER_PACE,
  },
  {
    kind: "tongue_twister",
    difficulty: "medium",
    title: "Red lorry, yellow lorry",
    body: "Red lorry, yellow lorry, red lorry, yellow lorry, red lorry, yellow lorry.",
    focus: "The l and r contrast, the hardest pair in English for many speakers.",
    ...TWISTER_PACE,
  },
  {
    kind: "tongue_twister",
    difficulty: "medium",
    title: "Sixth sick sheikh",
    body: "The sixth sick sheikh's sixth sheep is sick. Six sick sheep sat silently.",
    focus: "Consonant clusters at the end of words — the th and ks that get dropped.",
    ...TWISTER_PACE,
  },
  {
    kind: "tongue_twister",
    difficulty: "medium",
    title: "Unique New York",
    body: "Unique New York, unique New York, you know you need unique New York.",
    focus: "The y glide and the k landing — a favourite of broadcast warm-ups.",
    ...TWISTER_PACE,
  },
  {
    kind: "tongue_twister",
    difficulty: "hard",
    title: "Woodchuck",
    body: "How much wood would a woodchuck chuck if a woodchuck could chuck wood? He would chuck as much wood as a woodchuck could chuck if a woodchuck could chuck wood.",
    focus: "The w and ch alternation held over a long line without losing pace.",
    ...TWISTER_PACE,
  },
  {
    kind: "tongue_twister",
    difficulty: "hard",
    title: "Thistle sifter",
    body: "Theophilus Thistle, the successful thistle sifter, sifted a sieve of unsifted thistles.",
    focus: "Voiced and unvoiced th, the sound most often replaced with a d or an f.",
    ...TWISTER_PACE,
  },
  {
    kind: "tongue_twister",
    difficulty: "hard",
    title: "Three free throws",
    body: "Three free throws. Three free throws. The thirty-three thieves thought that they thrilled the throne.",
    focus: "The thr cluster — three consonants your mouth wants to reduce to two.",
    ...TWISTER_PACE,
  },

  /* ── Passages: sustained delivery ─────────────────────────────────────── */
  {
    kind: "passage",
    difficulty: "easy",
    title: "The morning train",
    body: "The train arrives at six minutes past seven, and it is almost never late. I have taken it for three years now, and in that time I have learned the exact spot on the platform where the doors will open. There is a small pleasure in knowing this. The people around me shuffle and guess, and I simply stand still and wait for the doors to arrive where I already am.",
    focus: "Steady pace across a paragraph, and landing the full stops instead of running sentences together.",
    ...PASSAGE_PACE,
  },
  {
    kind: "passage",
    difficulty: "easy",
    title: "What the map leaves out",
    body: "Every map is a decision about what to leave out. A street map does not show you which roads flood in the rain, or which shortcut feels unsafe after dark. It shows you distance and direction, and it lets you believe that is the whole story. The most useful maps are the ones that admit what they are missing.",
    focus: "Phrasing — grouping words into meaning rather than reading one word at a time.",
    ...PASSAGE_PACE,
  },
  {
    kind: "passage",
    difficulty: "medium",
    title: "The interview room",
    body: "Most people prepare for interviews by rehearsing answers, which is exactly backwards. The questions you can predict are the ones that reveal the least. What actually decides the room is how you handle the question you did not see coming: whether you take a breath and think, or fill the silence with words you do not mean. Practise the pause, not the paragraph.",
    focus: "Reading with intent — emphasis on the words that carry the argument.",
    ...PASSAGE_PACE,
  },
  {
    kind: "passage",
    difficulty: "medium",
    title: "On being understood",
    body: "Clarity is not the same as simplicity. A simple sentence can still be unclear, and a long one can be perfectly plain if every clause arrives where the listener expects it. The test is not how short you were. The test is whether the person listening had to go back and work out what you meant, and you will rarely be told when they did.",
    focus: "Clause boundaries — pausing where the sense breaks, not where you run out of air.",
    ...PASSAGE_PACE,
  },
  {
    kind: "passage",
    difficulty: "hard",
    title: "The engineer's confession",
    body: "The hardest part of the work was never the algorithm. It was admitting, three weeks in and in front of everyone, that the approach I had argued for could not be made to work, and that the colleague I had talked over on the first day had been right. The code took an afternoon to rewrite. The sentence took me considerably longer.",
    focus: "Holding pace through a long sentence without speeding up as it goes.",
    ...PASSAGE_PACE,
  },
  {
    kind: "passage",
    difficulty: "hard",
    title: "Numbers in the wild",
    body: "In 2019 the team reviewed 1,284 reports and found that 37 percent of them described the same 4 underlying faults. Fixing those 4 took 11 weeks. The remaining 63 percent, spread across 200 distinct causes, took the next 3 years. It is an uncomfortable ratio, and it is roughly the ratio you will find almost anywhere you look.",
    focus: "Saying figures aloud cleanly — the thing that trips people up in a real presentation.",
    ...PASSAGE_PACE,
  },
];
