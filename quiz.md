# PrepPulse — Study Quiz

Every question is followed by its answer, so this doubles as a reference you can
read straight through. Questions are grouped by area and roughly ordered
easy → hard. A ⭐ marks the ones that come up when someone asks you to defend the
project; ⭐⭐ marks the two or three worth having cold.

---

## How to use this

1. Read the question and say your answer **aloud, in full sentences** — the
   whole point of the product, so it may as well be the point of the quiz.
2. *Then* read on. The answer is directly underneath.
3. Note where you were vague rather than wrong. Vagueness is what fails
   interviews, and it is invisible until you say it out loud.
4. For any you miss, open the file named at the end of the answer and read the
   comment there.

Answers used to be hidden behind collapsible blocks. They are printed inline now
because the file is more useful as something you can read end to end — but that
means you have to stop yourself scrolling. Answer first.

---

## Sections

92 questions in all.

| | Area | Questions |
| --- | --- | --- |
| A | Architecture | A1–A4 |
| B | The scoring philosophy | B1–B6 |
| C | Practice loop | C1–C5 |
| D | Interview engine | D1–D17 |
| E | Group discussion & debate | E1–E4 |
| Ea | Conversation & scenarios | Ea1–Ea5 |
| Eb | Admin & cost | Eb1–Eb6 |
| Fa | Progress & gamification | Fa1–Fa8 |
| Fb | Monetization | Fb1–Fb6 |
| Fc | Voice & turn-taking | Fc1–Fc5 |
| Fd | Reading & presence | Fd1–Fd7 |
| F | Design system | F1–F5 |
| G | Reliability & security | G1–G6 |
| H | Traps | H1–H8 |

---

## A. Architecture

### A1. Why does no page fetch from an API route of ours?

Server components read the database directly and mutations go through server
actions. That keeps `DATABASE_URL` and both LLM keys server-side, and removes
an entire layer — no route per screen, no client fetch/loading/error state for
our own data, no client cache to invalidate.

The escape hatch exists: the functions in `lib/practice.ts` are
framework-agnostic and could be wrapped in route handlers if a mobile client
ever needed them.

*See `decisions.md` D1.*

### A2. `src/db/index.ts` exports a Proxy instead of a client. Why?

`next build` imports every module to collect page data. A client constructed at
import time would demand `DATABASE_URL` during the build, so you could not
build without production secrets.

The Proxy constructs on first *property access* instead. Note the detail:
methods are bound to the real instance (`value.bind(cached)`), because
otherwise `this` inside Drizzle points at the proxy.

**Interview angle:** the same lazy-getter reasoning drives `lib/env.ts`.

### A3. Why `neon-http` rather than a pooled connection, and what did it cost?

One round trip per query and no connection pool to leak across serverless
invocations — a pool per lambda is how you exhaust a database's connection
limit on Vercel.

The cost is no interactive transactions, which is why the Better Auth adapter
is configured `transaction: false`.

*See `decisions.md` D2.*

### A4. Which files must never contain I/O, and why does it matter?

`scoring.ts`, `interview-scoring.ts`, `gd-metrics.ts`, `gamification.ts`,
`billing.ts`, `scenarios.ts`, `cost.ts` — seven files, one test suite each.

They decide people's scores, what they've paid for, and what the product costs
to run. Keeping them pure is what lets them be tested with `node:assert` and
`tsx` — no test framework, no mocks, no database. The I/O lives one layer out
in `lib/ai/*` and the data-access modules.

---

## B. The scoring philosophy

### B1. State the governing rule of the codebase in one sentence.

**Anything countable is counted in code; only judgements go to a model.**

Filler counts, words per minute, speaking pace, speaking share, turn counts —
TypeScript. Fluency, structure, relevance, clarity — the model.

Language models are unreliable at arithmetic and completely reliable at having
an opinion. Asking one "how many times did they say um" invites a plausible
wrong number that you then display as fact.

**Interview angle:** this is the single best thing to lead with about the
project.

### B2. The model returns four scores. Where does the headline number come from?

From `weightedOverall()` in our code, using a per-mode weights table. The model
is never asked for an overall score.

Why: a model asked for a total will not reliably agree with its own component
scores, and you would be showing a headline that contradicts the breakdown
directly beneath it.

### B3. For extempore, structure is 0.25 and vocabulary 0.15. Defend that.

Holding a discernible shape — opening, body, close — while speaking
unprepared under a clock is the harder skill and the one that transfers.
Vocabulary range is easier to fake and matters less to whether a listener
follows you.

For interviews the weights change: relevance 0.30 and content 0.30, because a
fluent answer to a question nobody asked is the most common way a real round
goes badly.

### B4. ⭐ A user types their answer because their mic is blocked. What happens to pace, and why?

Pace is **excluded from the composite and renormalised over the remaining
dimensions** — not scored zero, not given a neutral guess. The report shows
`n/a` with the reason.

This came from live testing: a good typed answer measured 227 wpm and scored
`pace 10/100`, dropping the composite by 12 points purely for using the
accessibility fallback. Penalising someone for a broken microphone is
indefensible.

There is a regression test for it in `scoring.test.ts`.

**Interview angle:** a strong "bug I found and what it taught me" story.

### B5. Why is filler control scored on density rather than raw count?

A 60-second answer with three "um"s is worse than a three-minute answer with
four. Under 1% of words is clean; 8%+ is hard to listen to, with a linear ramp
between the anchors.

### B6. Why does the filler regex use lookarounds and `\b`?

So substrings never match. Without it, "unlike" counts as "like" and
"literally" contains "literal". There is an explicit test:
`findFillers("I dislike unlike likelihood")` must return zero hits.

Multi-word phrases like "you know" match as a unit, with `\s+` between words so
punctuation and double spaces don't break them.

---

## C. Practice loop

### C1. How is the daily topic chosen? Why no cron job?

`ORDER BY md5(topic_id::text || date) LIMIT 1`.

Deterministic per calendar day with nothing stored and nothing scheduled. The
same date always yields the same topic; the next date reshuffles the pool.

It is shared across all users so Phase 5's leaderboard compares like with like,
and so the reveal is an event rather than a private shuffle.

### C2. Why does the roll form post a `topicId` instead of the server re-picking?

Quick Challenge picks randomly. Re-picking server-side would hand the user a
different topic than the one they just watched land on screen.

### C3. ⭐ Streaks use a date sent by the browser. Isn't that trivially spoofable?

Partly, and deliberately. "Did I practise today" is a question about the
*user's* calendar — a 1am session in IST is still today to them, and UTC would
be wrong for most of the world.

The server clamps it: the submitted date is accepted only if it is within one
day of UTC today. So it fixes timezones without letting someone fabricate an
arbitrary streak. For a self-reported practice streak that is the right
trade-off; if streaks ever gated something valuable it would need revisiting.

### C4. Why was `AnimatePresence` removed — twice?

Because in this app it did not unmount its exiting children. The Daily Roll
accumulated 13 stacked `<p>` elements, and the practice room rendered the idle
panel and the speaking panel simultaneously — both confirmed by querying the
live DOM, not guessed.

Replaced with a keyed remount. The cost is no exit animations; at 70ms swap
intervals nobody sees an exit anyway, and a stale panel left on screen is a far
worse defect than a missing fade.

### C5. The waveform could have been a CSS loop. Why is it a Web Audio analyser?

Because while recording, the only question that matters is "can it hear me?"
A decorative animation that runs regardless actively lies about that.

If `getUserMedia` is refused it renders a flat line and says so, rather than
pretending.

---

## D. Interview engine

### D1. ⭐ All questions are generated before question one. The obvious design is to generate each after the previous answer. Why not?

Two reasons:

1. **Resumability.** A fixed set stored upfront means a session can be closed
   and picked up. Adaptive generation makes the session a stream you cannot
   re-enter.
2. **Drift.** If each question responds to the last answer, the interview
   gravitates toward whatever the candidate is comfortable with, instead of
   covering what the role actually tests.

The cost is that the round cannot adapt mid-flight — which is also true of a
real first-round interviewer working from a prepared list.

### D2. ⭐ Why does the interview score every answer at the end now, rather than immediately after each one?

It didn't always. This reverses an earlier decision (`decisions.md` D28), on
direct instruction, once the cost of the original design showed up in practice.

The original reasoning was real: a candidate who rambled on question 3 should
find out before they answer question 4. But it meant every question after the
first paid a two-to-six second model round trip *inside* the flow of
answering — the interview stopping to be graded, repeatedly, which is not how
an uninterrupted mock interview should feel.

Now `submitTranscript` is a plain insert with no model call — answering never
waits on anything — and `analyseSession` scores every question in one batch
after the last one is saved, with bounded concurrency so one slow or failed
call doesn't hold up the other nine. `finishInterview` then averages whatever
scored. The report is where the judgement shows up, question by question, all
at once — see the sequence diagram in `flow.md` §5 and `decisions.md` D79.

### D3. ⭐ A user scores 40, retries, scores 90. What is their average, and why?

The **90** counts. Answers are append-only — one row per attempt — and both
`runningAverage` and `aggregateScores` take the max per question.

If every attempt were averaged, improving on a retry would still drag your
score down, so the Retry button would punish exactly the people using it
properly.

The first attempt is kept so the report can show the delta (`+50`).

There is a test for the reverse case too: a *worse* retry (90 then 30) must not
overwrite the better first attempt.

### D4. Where is the uploaded resume PDF stored?

Nowhere. It is held in memory for the length of one request, sent to Gemini as
base64, and only the extracted JSON is persisted to `profiles`.

That is the privacy position, and it also means there is no bucket to secure,
no lifecycle policy, and no orphaned files to clean up. Guardrails — PDF only,
4MB cap, non-empty — run before anything reaches the model.

### D5. Why does `practice_sessions` have a `config` JSONB column?

Mode-specific settings: persona and question count for interviews, stance and
persona ids for debate. One nullable column per setting would mean a migration
for every new mode and a table that is mostly nulls.

### D6. ⭐ The candidate picks technologies at setup. How do you know the questions actually cover them?

Because it is counted, not hoped for. The prompt makes the model tag each
question with a `focusArea` naming which chosen topic it tests; code validates
that tag against the list the candidate selected and drops anything invented.
Coverage becomes a number — shown as a chip on the question, summarised on the
report as "Tested on: Postgres ×2, Kubernetes ×2", and asserted by
`npm run verify:focus` (6/8 tagged, 3/3 areas, baseline clean).

The instructive part is the first attempt. That script searched the question
text for the chosen words, and failed a set that was entirely on topic: a
question about re-architecting a write path under lock contention *is* a
system-design question and never contains the words "system design". Substring
matching measures vocabulary, not subject matter. This is B1 again — the
countable thing was "did the model say this question is about X", not "does the
text contain X".

### D7. Where do the suggested technologies come from?

The candidate's own resume — skills plus project tech, merged and deduped
case-insensitively — with free entry on top.

Not a curated list of frameworks, which would be wrong for most people and
stale within a year. The only technologies worth being interviewed on are the
ones you claimed; the free entry exists because the thing you most need to
practise is often on the job description rather than on your CV.

### D8. ⭐ Why is the ideal answer generated for every question but not shown until the end?

Reading a perfect answer to question 3 and then answering question 4 trains
recall rather than thinking — the phrasing you just read comes back out of your
mouth, and the score measures your short-term memory instead of your ability.

It costs one call either way, so it is generated as part of the same
end-of-session scoring batch that produces everything else (D2), and shown
only on the report: next to what you actually said, question by question,
where the comparison is the point.

### D9. A single answer is capped at ten minutes. Why enforce it in two places?

They protect different things. The room stops the clock and submits at the cap
so the candidate never discovers ten minutes later that nothing was listening.
The server clamps `durationSeconds` and truncates the transcript because the
client can be edited, and past ten minutes the recording is not an answer — it
is a live microphone someone walked away from, spending tokens on a transcript
nobody will read.

Note it *clamps* rather than rejects. A transcript over the cap still contains a
real answer, and throwing it away punishes the candidate for a limit that exists
to protect costs.

### D10. ⭐⭐ Gemini returns 503 "experiencing high demand". Where should that be handled?

In two places, for two different reasons.

**In the client:** 503 is transient — it means wait and it works. `callGemini`
now retries three times per model at 0.8s / 1.6s / 3.2s, then falls through to
the next model id, because a different id has separate capacity. Previously the
client only fell through on 404, so a capacity spike was fatal.

**In the flow:** even with retries, generation can fail. It used to run inside
the `startInterview` form action, so the failure threw from a server action —
which Next renders as a bare 500 page, discarding a setup form the user had just
filled in. Now the action writes the session row and redirects; the room asks
for the questions and has somewhere to show a failure and a retry button.

The complementary half is failing *fast* on what won't recover. A bad API key
returns 401 on every attempt, so retrying it burns twelve calls and twenty
seconds to learn what the first response already said — but it *does* fall over
to Groq, because a dead key is exactly what a second provider is for. See D13.

### D11. Why does the room generate the questions rather than the setup form?

Because a ten-to-twenty second wait needs a screen, and a failure needs
somewhere to land.

Everything the generator needs is already in `practice_sessions.config` —
persona, count, role, focus areas — so the room can ask for the questions
itself, and ask again if the first attempt failed. Side effects: closing the tab
mid-generation leaves a resumable session on the dashboard instead of nothing,
and the rate limit moved to where the model call actually is.

`prepareQuestions` returns early if questions exist, with the unique index on
`(session_id, position)` as the backstop against a race.

### D12. The generation effect has no cleanup flag. Isn't that a leak?

It is deliberate, and the version *with* a flag was the bug.

React double-invokes effects in development. A ref guard stops the second run
from generating twice. But a `cancelled` flag set in the cleanup discards the
*first* run's result — and the second run has already returned early on the
guard. The pair leaves the screen spinning forever over a set of questions that
were successfully written.

Setting state after unmount is a no-op in React 18+, so there is nothing to leak
here. Two safety mechanisms that each work alone can still break each other.

---

### D13. ⭐⭐ Two providers are configured. Why did an outage on one ever reach the user?

Because there was nothing to fall back *to*. The Groq call loop was written out
three times — in `score.ts`, `discussion.ts` and `topic-brief.ts` — each with
its own copy of the model list and its own `isModelUnavailable`, and none with
backoff. Three private functions, no shared entry point, so the Gemini client
had no Groq to call.

Extracting `lib/ai/groq.ts` removed 107 lines from those three files *and*
added a provider. That is the shape worth recognising: the duplication wasn't
just untidy, it was the thing preventing the feature.

`lib/ai/retry.ts` now holds what both clients share — the backoff policy and
the predicates that classify a failure.

### D14. ⭐ What must *not* fall back to the second provider, and why?

Two things, and both refusals are the interesting part.

**A PDF.** `extractResume` sends raw bytes as `inline_data` because Gemini
reads documents natively. Groq's chat API is text-only. There is no honest
fallback for resume extraction, so it doesn't get a dishonest one — the parts
array is checked for `inline_data` and the fallback declines.

**A content error.** If Gemini answered but the JSON didn't match the schema,
that is usually our prompt or our schema — not an outage. Failing over would
hide a bug we need to see and pay twice for the privilege. `isContentError`
draws the line between "the provider is unreachable" and "the provider replied
and we didn't like it".

The general principle: a fallback is for when you can't reach someone, not for
when you don't like their answer.

### D15. ⭐ The setup page used to require a resume. What was wrong with that, and what replaced it?

It meant no resume, no interview — and even with one on file, every question
pulled from it whether the candidate wanted that or not. Someone who just
wanted plain C# and JavaScript practice was forced through a resume upload and
then examined on their own projects anyway.

`useBackground` is now an explicit choice at setup, not something inferred
from whether a resume exists. Off, the generator is told nothing about the
candidate — no resume text, no skills description, and an explicit instruction
not to reference any project or employer even if one leaked in through
context — and every question comes from the chosen technologies instead of the
usual majority share. The setup page shows what's actually on file (role,
skills, or raw text) right above the choice, so picking "based on my
background" means something inspectable rather than a leap of faith. See
`decisions.md` D81.

### D16. ⭐ How does the app guarantee an exact easy/medium/hard split for any question count, rather than an approximate one?

By computing it in code and assigning it positionally, the same move as the
focus-area tag in D6/D69.

`difficultyBreakdown(count)` applies fixed shares (40/35/25) and the
largest-remainder method, so the three counts always sum to exactly `count` —
no rounding leftover, no "close to it." `difficultySlots()` expands that into
an ordered array, and each generated question is stamped with
`slots[index]` — its position in the array the model returned — never the
difficulty label the model put in its own JSON. Asking the model to hit a
ratio is a nudge; assigning by position is a guarantee. Verified for every
count 1 through 20 in `interview-scoring.test.ts`. See `decisions.md` D80.

### D17. A candidate's answer gets marked "vague" with no explanation of what a better answer needed. What's wrong with that feedback, and what replaced it?

"Be more specific" tells the candidate something is missing without saying
what — which isn't actionable if they didn't already know the answer, and if
they did, they wouldn't have given a vague one.

The `improvements` prompt now requires each bullet to name the actual missing
content: the specific technique, term, or fact a strong answer would have
included. "I optimized the query" with no how gets back "name the actual fix:
an index on the join column, or replacing repeated lookups with a single JOIN
instead of N+1 queries." A mention of joins with no kind specified gets "state
which join you used and why — an INNER JOIN if unmatched rows should be
dropped, a LEFT JOIN if the left side must be preserved." The bar: the
candidate should be able to paste the bullet into their next attempt almost
verbatim. See `decisions.md` D82.

## E. Group discussion & debate

### E1. ⭐ Three personas reply to each user turn. Why one model call rather than three?

Three calls would be three round trips, and each persona would answer without
having seen what the others just said — so they would all talk past each other
and past the user.

One call generating the whole exchange is cheaper *and* is the only way the
panel argues with **itself**, which is what makes it feel like a room rather
than three chatbots in a trench coat.

### E2. "Was that a rebuttal?" — who decides, and who counts?

The model decides (a judgement), returning `isRebuttal` and
`introducesArgument` for the user's turn. Those booleans are stored on the turn
row. `computeGdMetrics` only **tallies** them.

Exactly the same split as filler words: judgement to the model, arithmetic to
the code.

### E3. Why does taking 70% of the airtime score badly?

Because in a real group discussion, dominating is a failure mode just like
silence. The verdict is a band around an even split (`100 / participants`) with
a ceiling as well as a floor — "more is better" would teach the wrong lesson.

The band scales with participant count: 45% of the floor is fine with two
people and domineering with five. There is a test asserting exactly that.

### E4. A bug appeared where the arguments counter stayed at 0. What was it?

The client appends the user's turn optimistically so their own words appear
instantly. That optimistic turn had no tags yet, so the locally computed
metrics counted zero arguments and zero rebuttals until a page refresh.

Fixed by returning the tags from the `speak()` action and patching the
optimistic turn before appending the replies.

---

## Ea. Conversation & scenarios

### Ea1. ⭐ Phase 7 added two whole modes. How much new engine did it need?

None. Conversation and scenario use the same `discussion_turns` table, the same
`speak()` action and the same room component as group discussion and debate.

What actually got written: one data file, one prompt function, one setup page,
one start action. The room, transcript, composer, optimistic append and metrics
came for free.

A conversation *is* a turn loop — read history, send it with a brief, append
replies. A second engine would have been the same state machine with different
labels and twice the surface to keep in sync.

**Interview angle:** a good "I recognised I already had this" answer, which is
rarer than "I built a thing".

### Ea2. ⭐ Why is there code checking for "tell me more about that"?

Because deflecting is **always** the safe reply for a model, so it's the
failure mode it falls into under any uncertainty — and a counterpart that only
asks questions means the user is doing all the work, which is the opposite of
practice.

`isDeflection()` catches it (including any bare short question, whatever the
phrasing) and we re-ask **once**, naming the specific failure. Telling the model
not to do it helps; checking whether it did is what holds the line.

Exactly the same principle as counting filler words instead of asking. One
retry only — a second failure ships anyway rather than burning the user's rate
limit mid-conversation.

### Ea3. A test caught a bug in the repetition detector. What was it?

`"that's a fair point"` and `"that is a fair point"` share only half their words
once apostrophes are stripped, so a straight repeat read as novel.

Fixed by expanding contractions (`'s`, `n't`, `'re`, `'ll`, `'ve`, `'m`, `'d`)
before comparing word sets. The test was right; the detector was wrong.

### Ea4. Why does the counterpart speak first?

A role-play that opens with an empty box puts the hardest part — starting the
scene — on the person who came to practise the rest of it.

It also sets the tone instantly. *"This is the second time. The SECOND time."*
tells you what kind of room you're in before you type a word.

### Ea5. Why does role-play hide the speaking-share metric?

It would be actively misleading. A negotiation where you spoke 70% of the words
might be exactly right. The presence band exists to teach "don't dominate a
panel" — a lesson that doesn't transfer to a one-to-one.

---

## Eb. Admin & cost

### Eb1. ⭐ Which number leads the admin page, and why not total spend?

**Cost per session.** Measured at $0.0005.

Total spend on a portfolio project is a number near zero and tells you nothing.
Cost per session is the only figure that answers "does this scale" — multiply
it by the users you hope for and you have your answer.

Sessions that made no AI calls are excluded from the denominator, because an
abandoned session that never reached scoring would flatter the average and hide
the real number.

### Eb2. How much new data collection did Phase 8 need?

None. `ai_usage` has been written on every model call since Phase 1, for exactly
this. The rate limiter already reads the same rows — one table doing two jobs.

Phase 8 is aggregation over data that was already there.

### Eb3. ⭐ Why median latency rather than mean?

One 45-second provider timeout in a sample of four drags a mean to ~11 seconds
and makes a healthy p50 of 850ms look broken.

There's a test asserting exactly that: four calls at 700/800/900/45000ms must
report 850, not 11,850.

### Eb4. How is admin access controlled, and what happens if the config is empty?

An `ADMIN_EMAILS` allowlist. **Empty locks everyone out** — failing closed is
the only safe default for an access check, and an empty list letting everyone
in is the classic way this becomes a hole after a config change.

There's exactly one admin, so a roles table, permissions model and invite flow
would be machinery serving a single row.

### Eb5. A non-admin hits /admin. What status do they get, and why?

**404**, not 403. A 403 confirms the page exists. There's no reason to tell
anyone that, and no cost to not telling them.

### Eb6. The month projection is a straight line. Isn't that crude?

Yes, deliberately, and it's labelled as an estimate. With a handful of users
there isn't enough signal for anything cleverer, and a confident-looking
forecast built on three days of data would be worse than an obviously rough
one.

---

## Fa. Progress & gamification

### Fa1. ⭐ Upstash isn't configured. Why is there Redis code at all, and what happens without it?

Every Redis helper returns `null` on a miss, a timeout, or missing
credentials, and every caller treats `null` as "cache miss" and reads Postgres
instead. So the leaderboard is complete today and gets faster the moment
credentials appear — no code change.

Building it Redis-only would have shipped a dead feature; Postgres-only would
have thrown away the reason Redis is in the stack.

**Interview angle:** this is the "graceful degradation" answer, and it's more
interesting than "I added a cache".

### Fa2. What exactly does Redis do here, and why is that a real win?

Two jobs: the rolling leaderboard (a sorted set) and cached topic briefs (a
string with TTL).

Reading the top ten is one `ZRANGE`, O(log N). The Postgres equivalent scans a
week of sessions, joins evaluations and users, groups and sorts — fine at this
size, wasteful on every homepage render at any real size.

The plan was explicit that Redis had to be a genuine win rather than a résumé
line, and that's the distinction being drawn.

### Fa3. Leaderboard keys look like `lb:2026-w11`. Why bucket by week?

The bucket expires on its own. A single permanent sorted set would need a
trimming job to evict stale members — a cron nobody remembers to write. Weekly
keys with a nine-day TTL make eviction the database's problem.

### Fa4. ⭐ Someone takes a weekend off. What happens to their trend line, and why?

Nothing. `trend()` only averages days that were **actually practised**.

Counting rest days as zeroes would make taking a weekend off look like your
speaking ability collapsed. The chart makes the same distinction visually — the
line *breaks* across a gap rather than interpolating through it, because
joining the gap would invent a score for a day nobody practised.

There's a test asserting a two-day break yields a trend of exactly 0.

### Fa5. Why is the progress chart hand-written SVG rather than a chart library?

A library brings its own visual opinions — gridlines, tooltips, a legend — that
then need overriding to match the design system. Sixty lines of SVG inherits
the tokens directly and ships **nothing** to the browser, because it's a server
component.

One detail worth noting: the y-axis is pinned to 0–100. Auto-scaling to the
data would turn a four-point wobble into a visual cliff, which is a chart lying
about the size of a change.

### Fa6. Where are badges stored?

Nowhere. They're computed at render time from streaks, session counts and
scores.

Awarding rows would mean a backfill job every time a threshold changes;
deriving them means editing one number in one file. Locked badges stay visible
at reduced opacity so there's something to aim at — a list of only what you've
earned has no forward motion.

### Fa7. Why does the streak token bonus cap at 10?

An uncapped multiplier would make being on week three worth more than doing the
work well — the wrong incentive for a practice tool. There's a test asserting
that quality is always worth more than the streak bonus.

### Fa8. ⭐ Someone shares a result. What can a stranger with that link see?

The score, the topic, the six-dimension breakdown, word count and pace. **Not**
the transcript, not the coaching notes, not the person's name.

Sharing a result shouldn't mean publishing a recording of yourself thinking
aloud. The slug is random and separate from the session id, so a URL can't be
derived from an id; revoking is a slug change rather than a deletion, and a
revoked link 404s identically to one that never existed.

---

## Fb. Monetization

### Fb1. ⭐ Where do prices live, and why does it matter?

In the `plans` table. `db/plans.ts` is a *seed*, not the source of truth — the
pricing page reads the database at request time.

A price change should be a row update, not a deploy. Hardcoded prices are also
exactly how a pricing page ends up disagreeing with the checkout screen.

Money is stored in **minor units as an integer** (49900 = ₹499). Never a float.

### Fb2. ⭐ The paywall crashed with "Application error". What was the bug, and what's the rule?

The gate `throw`ew an `AppError` from inside a server action invoked by a
`<form action>`. A thrown server action renders Next's error boundary — so the
carefully written paywall message became a generic crash page.

**Rule: don't throw from a form action for an expected state.** `gateOrRedirect`
now redirects to `/pricing`, and the *page* separately calls `checkCanStart` and
renders a paywall instead of a start button.

Both layers exist on purpose: the page check is honesty (never offer a button
that can't work), the action check is security (a server action can be called
directly).

### Fb3. Why check the period end when the status column already says "active"?

With a real gateway, a row can sit at `active` until a webhook arrives. A
webhook that never arrives must not grant free access forever.

So `isSubscriptionActive` requires `status === 'active'` **and** an unexpired
period. There's a test for exactly that case.

### Fb4. ⭐ What has to change to swap the dummy checkout for Stripe?

`capturePayment()` and the checkout component, plus a webhook handler.

Nothing else — no schema migration, because `subscriptions` already carries
`provider`, `provider_ref` and `current_period_end`. And no screen anywhere
asks "what plan is this?", because entitlements are resolved in `lib/billing.ts`
and enforced in `lib/gate.ts`.

That's the whole point of a scaffold: it's only a scaffold if replacing it is
small.

### Fb5. Why is daily practice free rather than the hook for a paid tier?

The daily habit is what the product is *for*. Gating it would make the free
tier a demo, and nobody builds a habit inside a demo. Paid tiers unlock the
other rooms — interviews, group discussion, debate — which are the things you
need occasionally rather than daily.

### Fb6. The checkout has real card inputs. Isn't that misleading?

It would be if it didn't say so. The page states plainly that no gateway is
connected and that whatever is typed is discarded rather than transmitted, and
the fields are prefilled with obvious test values.

A fake payment form that doesn't announce it's fake is the wrong thing to ship,
even in a portfolio.

---

## Fc. Voice & turn-taking

### Fc1. ⭐⭐ How does the app know a user has finished speaking?

By watching the **transcript**, not the microphone. Every word the recogniser
emits re-runs an effect that clears and restarts a `silenceMs` timer; when the
words stop, the timer survives and the turn is handed over.

The obvious implementation — sample mic energy, fire after N ms below a
threshold — was the original, and it fails in both directions:

- **Background noise:** a fan, traffic, a TV next door. The level never drops
  far enough, so the turn *never ends*. The user is stuck holding a floor
  nobody will take.
- **A mid-sentence breath:** the level *does* drop. The turn ends early and half
  an answer gets submitted.

Both land on the user as "the app ignored me", which is the worst possible
failure for a speaking app. The recogniser already answers the question that
matters — *have new words arrived?* — after applying its own noise handling,
which is far better than a threshold on raw energy. Reading its output is both
simpler and more accurate, and needs no microphone permission beyond what the
recogniser already holds.

Mic energy is still sampled, for the level meter and for barge-in.

### Fc2. Why is `silenceMs` different in the interview room?

1.1s in discussion, 2.4s in interviews. Thinking mid-answer is normal in an
interview and must not cost you the floor; in a group discussion, a 2.4s gap is
long enough that the room feels dead.

Chrome finalises a result about a second after you stop, so the felt pause in an
interview is nearer three seconds — roughly what a real interviewer waits before
speaking.

### Fc3. ⭐ The interview room has no "done answering" button. Isn't that a trap if detection fails?

It would be, which is why the fallback is conditional rather than absent.
`canAutoSend` reports whether the hands-free path can work at all — speech
recognition supported, mic not blocked — and a manual submit renders only when
it is false.

The reasoning: a permanent stop button turns every natural pause into a decision
about whether to reach for the mouse, which is exactly what stops an interview
from feeling like an interview. An escape hatch that appears precisely when the
primary path cannot work costs nothing; one that is always visible teaches
everyone that pausing doesn't work.

The "Cut in" button was deleted for a related reason: it was a control for
something that already happens. Talk over the AI and the mic level crosses the
barge-in threshold — the floor is already yours. A control that duplicates a
behaviour teaches people the behaviour doesn't exist.

### Fc4. Why does the spoken text travel as a callback argument instead of being read from the hook?

Because `sendTurn` resets the recogniser *before* invoking `onTurnComplete`. A
handler that re-read `voiceSession.transcript` would find it already cleared and
bail with "we didn't catch an answer" — which is precisely the bug that made the
first version of auto-send appear to do nothing.

The room also calls back through a ref (`sendRef.current`) rather than a
captured closure, so the handler always reaches current state rather than
whatever was true when the session started.

### Fc5. Under 10 words, the model refuses to score. What does the room do with a 3-word utterance?

Nothing costly. It checks the word count *before* submitting, reopens the mic
via `resumeListening()`, and says so — "that was too short to score, keep going,
we're still listening".

Sending it would burn a model call to receive an error, then drop the user onto
a failure screen for clearing their throat. Every path out of `processing` calls
`resumeListening()` for the same reason: without it, a failed or empty turn
leaves the session stuck with a live mic and no way forward.

---

## Fd. Reading & presence

### Fd1. ⭐⭐ Reading practice compares what was said to a known text. Why isn't that a for-loop?

Because a for-loop breaks on the first skipped word.

Walking both word lists in step and comparing position by position means that
once a word is dropped, every word after it lands against the wrong slot. Miss a
single "the" in a forty-word passage and the report says you got almost nothing
right — which is both wrong and the most demoralising possible feedback.

Levenshtein alignment with a backtrace finds the cheapest set of edits instead,
so a skip costs exactly one skip, a misread is a substitution rather than a
delete plus an insert, and the words after the mistake still match. That is the
whole reason the mode produces usable output.

The same function runs in the browser during the read, so the words lighting up
green cannot disagree with the final score.

### Fd2. ⭐ You report reading "accuracy". What does that number actually measure?

How intelligibly you read **to a speech recogniser** — not your pronunciation.

The Web Speech API runs a language model over the audio. In a familiar phrase
like a tongue twister it will quietly repair a slurred word into the word it
expected, and it can miss an unusual word that was said perfectly. So a high
accuracy is a good sign rather than proof of clean articulation.

That caveat is written in the scoring module and repeated on the results screen.
Calling it a pronunciation score would be inventing precision we do not have —
and the fix isn't to hide the number, it's to say what it is worth. Pace and
completion, by contrast, are measured directly and are trustworthy.

### Fd3. Why do reading attempts stack up instead of overwriting?

Rereading to watch the number move is the exercise. A drill you can only attempt
once is a test.

So attempts are append-only, the session keeps the **best** read rather than the
last (a bad final take shouldn't erase a good one), and streak credit lands on
the first attempt only — twenty rereads of one twister is practice, not twenty
days of practice.

### Fd4. ⭐ Camera tracking was explicitly dropped in D61. What changed?

The user asked for it, and it turned out to clear the bar D61 was really
applying. D61's reasoning was that video didn't contribute to the thesis — but
whether you held the frame and how still you sat genuinely are part of how an
interview lands, and unlike expression they are **countable**.

So it came back on those terms only: in-frame share, look-aways, longest
absence, head drift, and a steadiness composite built from geometry alone.
Expression is displayed as a hint with a caveat and never enters a score,
because `faceExpressionNet` is a seven-class classifier trained largely on posed
faces and spontaneous expression is far subtler than what it learned.

### Fd5. ⭐ Why are look-aways measured in milliseconds rather than frames?

Because the detection loop is a `setInterval` competing with the main thread,
and it drops frames under load. A gap measured in frames would therefore *shrink*
exactly when the machine is busiest — the app would under-report distraction
precisely when the user's laptop is struggling.

Reading the gap off sample timestamps makes it wall-clock truth regardless of how
many frames survived. Anything under 500ms is treated as a blink or a detector
miss and is not reported, because telling someone they "looked away" when they
blinked destroys trust in every other number on the page.

### Fd6. How does a megabyte of TensorFlow not show up in the bundle?

A dynamic `import()` inside the enable path. The library and both model files
load the first time someone switches the camera on, cached in a module-level
promise so toggling off and on doesn't re-fetch half a megabyte.

Measured: shared JS unchanged at 102 kB, interview room +3.4 kB — the monitor
component and the hook, none of it TensorFlow. Weights are self-hosted from
`public/models` rather than a CDN, so there's no external runtime dependency and
nothing to break under a content security policy.

### Fd7. ⭐⭐ "The camera stops working after question one." One bug report — how many actual bugs was it?

Three, wearing one symptom.

1. **The remount.** `<PresenceMonitor>` was nested inside per-phase JSX, so
   React tore down and recreated the `<video>` element on every phase change.
   `usePresence` only assigns `video.srcObject = stream` once, inside
   `start()` — a remounted `<video>` never got the stream reattached, so
   tracking silently stopped doing anything useful while the UI still claimed
   `"tracking"`. Fixed by mounting the monitor once for the room's whole
   lifetime and toggling visibility with a CSS class instead.
2. **A re-entry race.** A slow face-model load plus an impatient second click
   on "Turn on" could fire two concurrent `getUserMedia` calls, leaking a
   stream nothing ever stopped. Fixed with a guard at the top of `start()`
   that returns immediately if a start is already `loading`, `requesting`, or
   `tracking`.
3. **A dead-end error status.** Every non-permission failure — no camera
   present, the camera held by another app, the model fetch failing, or
   simply running over http — collapsed into one bare `"error"` status with no
   text anywhere in the UI. Fixed by distinguishing `NotFoundError` and
   `NotReadableError`, adding an explicit `window.isSecureContext` check
   *before* anything else runs (browsers refuse `getUserMedia` outright on
   non-https origins, with an error that reads exactly like a permission
   denial), and surfacing everything else as a real `errorDetail` message on
   the panel.

The lesson: fixing only the first, most visible cause would have left the
diagnostic dead end in place for the next person whose camera failed for a
completely different reason. See `decisions.md` D83.

---

## F. Design system

### F1. ⭐ `@theme` vs `@theme static` in Tailwind v4 — what breaks, and how would you notice?

By default v4 only emits theme variables that a **generated utility**
references. Tokens consumed only by hand-written CSS are tree-shaken away.

The failure is silent: `--font-display` resolved to nothing so the display face
fell back to system-ui, and `blur(var(--blur-dense))` became invalid so every
glass surface lost its backdrop-filter. No error, no warning, just a page that
looked subtly wrong.

Found by reading computed styles in the browser, not by reading the source.

### F2. ⭐ next/font variables were on `<body>`. Every font silently fell back. Why?

A CSS custom property is substituted **where it is declared**, not where it is
used.

`@theme` declares `--font-sans: var(--font-geist-sans), ...` on `:root`
(= `<html>`). With `--font-geist-sans` defined only on `<body>`, the `:root`
declaration referenced an undefined variable, so `--font-sans` became the
guaranteed-invalid value. `font-family: var(--font-sans)` was then invalid at
computed-value time, and inherited preflight's `-apple-system` instead.

Fix: put the font `.variable` classes on `<html>`.

**Interview angle:** a genuinely good CSS-fundamentals answer.

### F3. Why must you not hand-write `-webkit-backdrop-filter`?

Lightning CSS adds prefixes from browserslist. Writing the prefixed form
manually made it emit **only** the prefixed property — which the target Chrome
does not support (`CSS.supports('-webkit-backdrop-filter', 'blur(2px)')` →
`false`). Every glass surface silently lost its blur.

Write the standard property and let the toolchain prefix.

### F4. Name the five materials and when each is used.

- **clear** — floating chrome: navigation, toolbars
- **dense** — important interactive surfaces you act on
- **frost** — modals and sheets, which push their context away
- **liquid** — the main application surface that holds content
- **solid** — maximum readability, no blur, nothing showing through

Most surfaces are *not* glass. Glass reads as expensive precisely because it is
rare and sits against solids; `backdrop-blur` on every card is the clearest
tell of a template.

### F5. Why is letter-spacing not a single global value?

Tracking is a function of size. Large display text reads too loose as it grows
and wants negative tracking (`-0.05em` at hero); body sits near zero; small
uppercase metadata needs *positive* tracking (`+0.16em`) to stay legible.

One global value is wrong at both ends of the scale.

---

## G. Reliability & security

### G1. ⭐ Rate limiting uses no dedicated table. How, and what's the advantage?

It counts rows in `ai_usage` — which every LLM call already writes for cost
tracking — over a rolling minute and day.

No new table, no new infrastructure, and unlike an in-process counter it
survives across serverless invocations where each request may hit a different
instance.

It also **fails open**: if the limiter itself errors, practice continues. A
broken limiter must not become a broken product.

Phase 5 swaps the counter for Redis without touching a single call site.

**The catch, and the bug it caused:** `ai_usage` holds one row per provider
*attempt*, not per user request. Once retries and the Groq fallback landed, a
single answer could write up to nine Gemini rows and nine Groq rows — so one
click during an outage blew a six-per-minute cap by itself and locked the user
out of the feature that had just failed them.

The fix is a `WHERE ok` on the count. A failed call returns no tokens and costs
nothing, so it has no business consuming the budget this cap exists to protect;
one completed operation writes exactly one `ok` row whichever provider served
it. Reusing an existing table is still the right call — but "rows in the cost
table" and "requests the user made" stopped being the same thing the moment
retries existed. *See `decisions.md` D75.*

### G2. A user signs up with a magic link, then later clicks "Continue with Google". What happens?

They land in the **same account**. Magic link sets `emailVerified: true`, and
Google is a trusted provider, so Better Auth links the identities on the exact
email match.

`allowDifferentEmails` stays `false`, so linking only ever happens on an exact
address match — never across addresses.

### G3. Why is `requireEmailVerification` currently off, and why is that not a hole?

Email delivery is unreliable in this environment (Resend only delivers to the
account owner until a domain is verified), so requiring verification would
block signup entirely.

It is not a takeover hole because account linking still requires a **locally
verified** email. Someone squatting your address with a password cannot capture
your Google identity when you later sign in with it.

It is marked with a `ponytail:` comment naming the upgrade path.

### G4. Why does `getSession()` re-throw some errors instead of catching everything?

Next.js uses thrown errors as control flow — `DYNAMIC_SERVER_USAGE`,
`NEXT_REDIRECT`, `NEXT_NOT_FOUND`, tagged via a `digest` property. Swallowing
them breaks the framework.

Anything else is treated as signed-out, so a database blip renders the
signed-out state rather than blanking the page. The original version caught
everything and produced a flood of "failed to resolve session" logs during
build.

### G5. Why is every session query scoped by `userId` as well as `id`?

So a session id alone is never sufficient to read or mutate someone else's
data. Session ids are UUIDs but they appear in URLs and get shared; treating
them as capabilities would be an IDOR waiting to happen.

`abandonSession` originally missed this and was fixed.

### G6. Both providers walk a list of model ids. Why?

Both retire ids without notice. `gemini-2.0-flash` already 404s on this
project's key — verified by listing the models the key can actually see, rather
than trusting documentation.

Falling through on "model not found" means one retirement does not take the
product down.

---

## H. Traps

Short answers. These are the ones that cost real time.

### H1. Two `next dev` servers on one project — what breaks?

They share `.next` and both write `_buildManifest.js.tmp.*`, deleting each
other's temp files before the rename lands. Result: a flood of `ENOENT` and a
dead server. `.claude/launch.json` sets `autoPort: false` so a second start
refuses instead of competing.

### H2. `??` vs `||` for a user's name — why did `??` produce "Good evening, "?

Magic-link signup stores `name: ""`, not `null`. `??` only catches
null/undefined, so the empty string passed straight through. Use `||`, or
derive a name from the email local part.

### H3. An import error that contradicts a passing `tsc` — what is it?

A stale Turbopack dev cache, usually after an import and its usage landed in
separate edits. `taskkill /F /IM node.exe && rmdir /s /q .next && npm run dev`.

### H4. Why did `.env` render as `â”€â”€â”€`?

UTF-8 box-drawing characters read as Windows-1252. PowerShell 5.1's
`Get-Content -Raw` decodes as ANSI and `Set-Content -Encoding utf8` writes a
BOM. Fix: ASCII-only in config files, and never round-trip a UTF-8 source
through PS 5.1.

### H5. Why did every magic-link request 403 on a non-3000 port?

Better Auth's CSRF check trusts only `baseURL` by default. `trustedOrigins` now
covers Vercel preview URLs and — gated on `NODE_ENV` so it never ships — any
localhost port.

### H6. ⭐ Running <code>npm run build</code> killed the dev server. Why?

Both `next build` and `next dev` write to `.next`. Run them together and they
delete each other's `_buildManifest.js.tmp.*` files before the rename lands —
an `ENOENT` flood and a dead server.

Same root cause as running two dev servers. **Never build while dev is
running.** Kill node, delete `.next`, restart.

### H7. A server action throws for an expected state. What does the user see?

"Application error: a server-side exception has occurred." Next renders the
error boundary — your message never arrives. Redirect, or render the state on
the page instead.

---

### H8. Dev broke on a <em>fresh</em> start, with no other server running. Why?

Leftover **production** artifacts in `.next` from an earlier `next build` also
break dev — it isn't only about simultaneous processes.

`npm run dev:clean` deletes `.next` first. Use it after any build.

## Self-assessment

Rate yourself honestly on each area:

| Area | Can explain the *what* | Can defend the *why* | Could rebuild it |
| --- | --- | --- | --- |
| Architecture & layering | | | |
| Scoring philosophy | | | |
| Interview engine | | | |
| Voice & turn-taking | | | |
| Reading & presence | | | |
| GD & debate | | | |
| Conversation & scenarios | | | |
| Admin & cost | | | |
| Progress & gamification | | | |
| Monetization | | | |
| Design system | | | |
| Reliability & security | | | |

The middle column is the one interviews test. If you can state a decision but
not the alternative you rejected, go back to `decisions.md` — every entry names
what was rejected and why.

**The six to have ready cold:**

1. **B1** — countable vs judgement. The governing rule of the codebase, and the
   best thing to lead with.
2. **D3** — retries take the max, because averaging would punish the people
   using the Retry button properly.
3. **G1** — rate limiting counts the cost-tracking table, so it needed no new
   infrastructure and survives serverless — and the follow-up, that counting
   provider *attempts* rather than successes turned retries into a lockout.
4. **Fb4** — swapping the payment gateway touches two files, because
   entitlements were never scattered through the screens.
5. **Ea1** — two whole modes shipped with no new engine, because a
   conversation is a turn loop and one already existed.
6. **Fc1** — end-of-turn is read off the transcript, not the microphone,
   because a volume threshold fails in both directions and both failures read
   to the user as being ignored.

**If you only remember one sentence:** *anything countable is counted in code;
only judgements go to a model.* Almost every other decision in this project
falls out of that one.
