# PrepPulse — Study Quiz

Work through these to actually understand the codebase rather than recognise
it. Answer out loud before opening the answer — that is the whole point of the
product, so it may as well be the point of the quiz.

Questions are grouped by area and roughly ordered easy → hard. The **Interview
angle** notes mark the ones that come up when someone asks you to defend the
project.

---

## How to use this

1. Read the question. Say your answer aloud, in full sentences.
2. Open the answer. Note where you were vague rather than wrong — vagueness is
   what fails interviews.
3. For any you miss, open the file named in the answer and read the comment.

---

## A. Architecture

<details>
<summary><b>A1.</b> Why does no page fetch from an API route of ours?</summary>

Server components read the database directly and mutations go through server
actions. That keeps `DATABASE_URL` and both LLM keys server-side, and removes
an entire layer — no route per screen, no client fetch/loading/error state for
our own data, no client cache to invalidate.

The escape hatch exists: the functions in `lib/practice.ts` are
framework-agnostic and could be wrapped in route handlers if a mobile client
ever needed them.

*See `decisions.md` D1.*
</details>

<details>
<summary><b>A2.</b> `src/db/index.ts` exports a Proxy instead of a client. Why?</summary>

`next build` imports every module to collect page data. A client constructed at
import time would demand `DATABASE_URL` during the build, so you could not
build without production secrets.

The Proxy constructs on first *property access* instead. Note the detail:
methods are bound to the real instance (`value.bind(cached)`), because
otherwise `this` inside Drizzle points at the proxy.

**Interview angle:** the same lazy-getter reasoning drives `lib/env.ts`.
</details>

<details>
<summary><b>A3.</b> Why `neon-http` rather than a pooled connection, and what did it cost?</summary>

One round trip per query and no connection pool to leak across serverless
invocations — a pool per lambda is how you exhaust a database's connection
limit on Vercel.

The cost is no interactive transactions, which is why the Better Auth adapter
is configured `transaction: false`.

*See `decisions.md` D2.*
</details>

<details>
<summary><b>A4.</b> Which three files must never contain I/O, and why does it matter?</summary>

`lib/scoring.ts`, `lib/interview-scoring.ts`, `lib/gd-metrics.ts`.

They decide people's scores. Keeping them pure is what lets them be tested with
`node:assert` and `tsx` — no test framework, no mocks, no database. The I/O
lives one layer out in `lib/ai/*`.
</details>

---

## B. The scoring philosophy

<details>
<summary><b>B1.</b> State the governing rule of the codebase in one sentence.</summary>

**Anything countable is counted in code; only judgements go to a model.**

Filler counts, words per minute, speaking pace, speaking share, turn counts —
TypeScript. Fluency, structure, relevance, clarity — the model.

Language models are unreliable at arithmetic and completely reliable at having
an opinion. Asking one "how many times did they say um" invites a plausible
wrong number that you then display as fact.

**Interview angle:** this is the single best thing to lead with about the
project.
</details>

<details>
<summary><b>B2.</b> The model returns four scores. Where does the headline number come from?</summary>

From `weightedOverall()` in our code, using a per-mode weights table. The model
is never asked for an overall score.

Why: a model asked for a total will not reliably agree with its own component
scores, and you would be showing a headline that contradicts the breakdown
directly beneath it.
</details>

<details>
<summary><b>B3.</b> For extempore, structure is 0.25 and vocabulary 0.15. Defend that.</summary>

Holding a discernible shape — opening, body, close — while speaking
unprepared under a clock is the harder skill and the one that transfers.
Vocabulary range is easier to fake and matters less to whether a listener
follows you.

For interviews the weights change: relevance 0.30 and content 0.30, because a
fluent answer to a question nobody asked is the most common way a real round
goes badly.
</details>

<details>
<summary><b>B4. ⭐</b> A user types their answer because their mic is blocked. What happens to pace, and why?</summary>

Pace is **excluded from the composite and renormalised over the remaining
dimensions** — not scored zero, not given a neutral guess. The report shows
`n/a` with the reason.

This came from live testing: a good typed answer measured 227 wpm and scored
`pace 10/100`, dropping the composite by 12 points purely for using the
accessibility fallback. Penalising someone for a broken microphone is
indefensible.

There is a regression test for it in `scoring.test.ts`.

**Interview angle:** a strong "bug I found and what it taught me" story.
</details>

<details>
<summary><b>B5.</b> Why is filler control scored on density rather than raw count?</summary>

A 60-second answer with three "um"s is worse than a three-minute answer with
four. Under 1% of words is clean; 8%+ is hard to listen to, with a linear ramp
between the anchors.
</details>

<details>
<summary><b>B6.</b> Why does the filler regex use lookarounds and `\b`?</summary>

So substrings never match. Without it, "unlike" counts as "like" and
"literally" contains "literal". There is an explicit test:
`findFillers("I dislike unlike likelihood")` must return zero hits.

Multi-word phrases like "you know" match as a unit, with `\s+` between words so
punctuation and double spaces don't break them.
</details>

---

## C. Practice loop

<details>
<summary><b>C1.</b> How is the daily topic chosen? Why no cron job?</summary>

`ORDER BY md5(topic_id::text || date) LIMIT 1`.

Deterministic per calendar day with nothing stored and nothing scheduled. The
same date always yields the same topic; the next date reshuffles the pool.

It is shared across all users so Phase 5's leaderboard compares like with like,
and so the reveal is an event rather than a private shuffle.
</details>

<details>
<summary><b>C2.</b> Why does the roll form post a `topicId` instead of the server re-picking?</summary>

Quick Challenge picks randomly. Re-picking server-side would hand the user a
different topic than the one they just watched land on screen.
</details>

<details>
<summary><b>C3. ⭐</b> Streaks use a date sent by the browser. Isn't that trivially spoofable?</summary>

Partly, and deliberately. "Did I practise today" is a question about the
*user's* calendar — a 1am session in IST is still today to them, and UTC would
be wrong for most of the world.

The server clamps it: the submitted date is accepted only if it is within one
day of UTC today. So it fixes timezones without letting someone fabricate an
arbitrary streak. For a self-reported practice streak that is the right
trade-off; if streaks ever gated something valuable it would need revisiting.
</details>

<details>
<summary><b>C4.</b> Why was `AnimatePresence` removed — twice?</summary>

Because in this app it did not unmount its exiting children. The Daily Roll
accumulated 13 stacked `<p>` elements, and the practice room rendered the idle
panel and the speaking panel simultaneously — both confirmed by querying the
live DOM, not guessed.

Replaced with a keyed remount. The cost is no exit animations; at 70ms swap
intervals nobody sees an exit anyway, and a stale panel left on screen is a far
worse defect than a missing fade.
</details>

<details>
<summary><b>C5.</b> The waveform could have been a CSS loop. Why is it a Web Audio analyser?</summary>

Because while recording, the only question that matters is "can it hear me?"
A decorative animation that runs regardless actively lies about that.

If `getUserMedia` is refused it renders a flat line and says so, rather than
pretending.
</details>

---

## D. Interview engine

<details>
<summary><b>D1. ⭐</b> All questions are generated before question one. The obvious design is to generate each after the previous answer. Why not?</summary>

Two reasons:

1. **Resumability.** A fixed set stored upfront means a session can be closed
   and picked up. Adaptive generation makes the session a stream you cannot
   re-enter.
2. **Drift.** If each question responds to the last answer, the interview
   gravitates toward whatever the candidate is comfortable with, instead of
   covering what the role actually tests.

The cost is that the round cannot adapt mid-flight — which is also true of a
real first-round interviewer working from a prepared list.
</details>

<details>
<summary><b>D2. ⭐</b> Why analyse each answer immediately rather than scoring the whole transcript at the end?</summary>

Because a candidate who rambled on question 3 should find out before they
answer question 4. Feedback banked until the end cannot change behaviour during
the only window where behaviour is being practised.

It also gives a running average, so the session has a live sense of how it is
going.

This was flagged in the original plan as the trickiest piece of logic in the
app, and it is: see the sequence diagram in `flow.md` §5.
</details>

<details>
<summary><b>D3. ⭐</b> A user scores 40, retries, scores 90. What is their average, and why?</summary>

The **90** counts. Answers are append-only — one row per attempt — and both
`runningAverage` and `aggregateScores` take the max per question.

If every attempt were averaged, improving on a retry would still drag your
score down, so the Retry button would punish exactly the people using it
properly.

The first attempt is kept so the report can show the delta (`+50`).

There is a test for the reverse case too: a *worse* retry (90 then 30) must not
overwrite the better first attempt.
</details>

<details>
<summary><b>D4.</b> Where is the uploaded resume PDF stored?</summary>

Nowhere. It is held in memory for the length of one request, sent to Gemini as
base64, and only the extracted JSON is persisted to `profiles`.

That is the privacy position, and it also means there is no bucket to secure,
no lifecycle policy, and no orphaned files to clean up. Guardrails — PDF only,
4MB cap, non-empty — run before anything reaches the model.
</details>

<details>
<summary><b>D5.</b> Why does `practice_sessions` have a `config` JSONB column?</summary>

Mode-specific settings: persona and question count for interviews, stance and
persona ids for debate. One nullable column per setting would mean a migration
for every new mode and a table that is mostly nulls.
</details>

---

## E. Group discussion & debate

<details>
<summary><b>E1. ⭐</b> Three personas reply to each user turn. Why one model call rather than three?</summary>

Three calls would be three round trips, and each persona would answer without
having seen what the others just said — so they would all talk past each other
and past the user.

One call generating the whole exchange is cheaper *and* is the only way the
panel argues with **itself**, which is what makes it feel like a room rather
than three chatbots in a trench coat.
</details>

<details>
<summary><b>E2.</b> "Was that a rebuttal?" — who decides, and who counts?</summary>

The model decides (a judgement), returning `isRebuttal` and
`introducesArgument` for the user's turn. Those booleans are stored on the turn
row. `computeGdMetrics` only **tallies** them.

Exactly the same split as filler words: judgement to the model, arithmetic to
the code.
</details>

<details>
<summary><b>E3.</b> Why does taking 70% of the airtime score badly?</summary>

Because in a real group discussion, dominating is a failure mode just like
silence. The verdict is a band around an even split (`100 / participants`) with
a ceiling as well as a floor — "more is better" would teach the wrong lesson.

The band scales with participant count: 45% of the floor is fine with two
people and domineering with five. There is a test asserting exactly that.
</details>

<details>
<summary><b>E4.</b> A bug appeared where the arguments counter stayed at 0. What was it?</summary>

The client appends the user's turn optimistically so their own words appear
instantly. That optimistic turn had no tags yet, so the locally computed
metrics counted zero arguments and zero rebuttals until a page refresh.

Fixed by returning the tags from the `speak()` action and patching the
optimistic turn before appending the replies.
</details>

---

## Fa. Progress & gamification

<details>
<summary><b>Fa1. ⭐</b> Upstash isn't configured. Why is there Redis code at all, and what happens without it?</summary>

Every Redis helper returns `null` on a miss, a timeout, or missing
credentials, and every caller treats `null` as "cache miss" and reads Postgres
instead. So the leaderboard is complete today and gets faster the moment
credentials appear — no code change.

Building it Redis-only would have shipped a dead feature; Postgres-only would
have thrown away the reason Redis is in the stack.

**Interview angle:** this is the "graceful degradation" answer, and it's more
interesting than "I added a cache".
</details>

<details>
<summary><b>Fa2.</b> What exactly does Redis do here, and why is that a real win?</summary>

Two jobs: the rolling leaderboard (a sorted set) and cached topic briefs (a
string with TTL).

Reading the top ten is one `ZRANGE`, O(log N). The Postgres equivalent scans a
week of sessions, joins evaluations and users, groups and sorts — fine at this
size, wasteful on every homepage render at any real size.

The plan was explicit that Redis had to be a genuine win rather than a résumé
line, and that's the distinction being drawn.
</details>

<details>
<summary><b>Fa3.</b> Leaderboard keys look like `lb:2026-w11`. Why bucket by week?</summary>

The bucket expires on its own. A single permanent sorted set would need a
trimming job to evict stale members — a cron nobody remembers to write. Weekly
keys with a nine-day TTL make eviction the database's problem.
</details>

<details>
<summary><b>Fa4. ⭐</b> Someone takes a weekend off. What happens to their trend line, and why?</summary>

Nothing. `trend()` only averages days that were **actually practised**.

Counting rest days as zeroes would make taking a weekend off look like your
speaking ability collapsed. The chart makes the same distinction visually — the
line *breaks* across a gap rather than interpolating through it, because
joining the gap would invent a score for a day nobody practised.

There's a test asserting a two-day break yields a trend of exactly 0.
</details>

<details>
<summary><b>Fa5.</b> Why is the progress chart hand-written SVG rather than a chart library?</summary>

A library brings its own visual opinions — gridlines, tooltips, a legend — that
then need overriding to match the design system. Sixty lines of SVG inherits
the tokens directly and ships **nothing** to the browser, because it's a server
component.

One detail worth noting: the y-axis is pinned to 0–100. Auto-scaling to the
data would turn a four-point wobble into a visual cliff, which is a chart lying
about the size of a change.
</details>

<details>
<summary><b>Fa6.</b> Where are badges stored?</summary>

Nowhere. They're computed at render time from streaks, session counts and
scores.

Awarding rows would mean a backfill job every time a threshold changes;
deriving them means editing one number in one file. Locked badges stay visible
at reduced opacity so there's something to aim at — a list of only what you've
earned has no forward motion.
</details>

<details>
<summary><b>Fa7.</b> Why does the streak token bonus cap at 10?</summary>

An uncapped multiplier would make being on week three worth more than doing the
work well — the wrong incentive for a practice tool. There's a test asserting
that quality is always worth more than the streak bonus.
</details>

<details>
<summary><b>Fa8. ⭐</b> Someone shares a result. What can a stranger with that link see?</summary>

The score, the topic, the six-dimension breakdown, word count and pace. **Not**
the transcript, not the coaching notes, not the person's name.

Sharing a result shouldn't mean publishing a recording of yourself thinking
aloud. The slug is random and separate from the session id, so a URL can't be
derived from an id; revoking is a slug change rather than a deletion, and a
revoked link 404s identically to one that never existed.
</details>

---

## Fb. Monetization

<details>
<summary><b>Fb1. ⭐</b> Where do prices live, and why does it matter?</summary>

In the `plans` table. `db/plans.ts` is a *seed*, not the source of truth — the
pricing page reads the database at request time.

A price change should be a row update, not a deploy. Hardcoded prices are also
exactly how a pricing page ends up disagreeing with the checkout screen.

Money is stored in **minor units as an integer** (49900 = ₹499). Never a float.
</details>

<details>
<summary><b>Fb2. ⭐</b> The paywall crashed with "Application error". What was the bug, and what's the rule?</summary>

The gate `throw`ew an `AppError` from inside a server action invoked by a
`<form action>`. A thrown server action renders Next's error boundary — so the
carefully written paywall message became a generic crash page.

**Rule: don't throw from a form action for an expected state.** `gateOrRedirect`
now redirects to `/pricing`, and the *page* separately calls `checkCanStart` and
renders a paywall instead of a start button.

Both layers exist on purpose: the page check is honesty (never offer a button
that can't work), the action check is security (a server action can be called
directly).
</details>

<details>
<summary><b>Fb3.</b> Why check the period end when the status column already says "active"?</summary>

With a real gateway, a row can sit at `active` until a webhook arrives. A
webhook that never arrives must not grant free access forever.

So `isSubscriptionActive` requires `status === 'active'` **and** an unexpired
period. There's a test for exactly that case.
</details>

<details>
<summary><b>Fb4. ⭐</b> What has to change to swap the dummy checkout for Stripe?</summary>

`capturePayment()` and the checkout component, plus a webhook handler.

Nothing else — no schema migration, because `subscriptions` already carries
`provider`, `provider_ref` and `current_period_end`. And no screen anywhere
asks "what plan is this?", because entitlements are resolved in `lib/billing.ts`
and enforced in `lib/gate.ts`.

That's the whole point of a scaffold: it's only a scaffold if replacing it is
small.
</details>

<details>
<summary><b>Fb5.</b> Why is daily practice free rather than the hook for a paid tier?</summary>

The daily habit is what the product is *for*. Gating it would make the free
tier a demo, and nobody builds a habit inside a demo. Paid tiers unlock the
other rooms — interviews, group discussion, debate — which are the things you
need occasionally rather than daily.
</details>

<details>
<summary><b>Fb6.</b> The checkout has real card inputs. Isn't that misleading?</summary>

It would be if it didn't say so. The page states plainly that no gateway is
connected and that whatever is typed is discarded rather than transmitted, and
the fields are prefilled with obvious test values.

A fake payment form that doesn't announce it's fake is the wrong thing to ship,
even in a portfolio.
</details>

---

## F. Design system

<details>
<summary><b>F1. ⭐</b> `@theme` vs `@theme static` in Tailwind v4 — what breaks, and how would you notice?</summary>

By default v4 only emits theme variables that a **generated utility**
references. Tokens consumed only by hand-written CSS are tree-shaken away.

The failure is silent: `--font-display` resolved to nothing so the display face
fell back to system-ui, and `blur(var(--blur-dense))` became invalid so every
glass surface lost its backdrop-filter. No error, no warning, just a page that
looked subtly wrong.

Found by reading computed styles in the browser, not by reading the source.
</details>

<details>
<summary><b>F2. ⭐</b> next/font variables were on `<body>`. Every font silently fell back. Why?</summary>

A CSS custom property is substituted **where it is declared**, not where it is
used.

`@theme` declares `--font-sans: var(--font-geist-sans), ...` on `:root`
(= `<html>`). With `--font-geist-sans` defined only on `<body>`, the `:root`
declaration referenced an undefined variable, so `--font-sans` became the
guaranteed-invalid value. `font-family: var(--font-sans)` was then invalid at
computed-value time, and inherited preflight's `-apple-system` instead.

Fix: put the font `.variable` classes on `<html>`.

**Interview angle:** a genuinely good CSS-fundamentals answer.
</details>

<details>
<summary><b>F3.</b> Why must you not hand-write `-webkit-backdrop-filter`?</summary>

Lightning CSS adds prefixes from browserslist. Writing the prefixed form
manually made it emit **only** the prefixed property — which the target Chrome
does not support (`CSS.supports('-webkit-backdrop-filter', 'blur(2px)')` →
`false`). Every glass surface silently lost its blur.

Write the standard property and let the toolchain prefix.
</details>

<details>
<summary><b>F4.</b> Name the five materials and when each is used.</summary>

- **clear** — floating chrome: navigation, toolbars
- **dense** — important interactive surfaces you act on
- **frost** — modals and sheets, which push their context away
- **liquid** — the main application surface that holds content
- **solid** — maximum readability, no blur, nothing showing through

Most surfaces are *not* glass. Glass reads as expensive precisely because it is
rare and sits against solids; `backdrop-blur` on every card is the clearest
tell of a template.
</details>

<details>
<summary><b>F5.</b> Why is letter-spacing not a single global value?</summary>

Tracking is a function of size. Large display text reads too loose as it grows
and wants negative tracking (`-0.05em` at hero); body sits near zero; small
uppercase metadata needs *positive* tracking (`+0.16em`) to stay legible.

One global value is wrong at both ends of the scale.
</details>

---

## G. Reliability & security

<details>
<summary><b>G1. ⭐</b> Rate limiting uses no dedicated table. How, and what's the advantage?</summary>

It counts rows in `ai_usage` — which every LLM call already writes for cost
tracking — over a rolling minute and day.

No new table, no new infrastructure, and unlike an in-process counter it
survives across serverless invocations where each request may hit a different
instance.

It also **fails open**: if the limiter itself errors, practice continues. A
broken limiter must not become a broken product.

Phase 5 swaps the counter for Redis without touching a single call site.
</details>

<details>
<summary><b>G2.</b> A user signs up with a magic link, then later clicks "Continue with Google". What happens?</summary>

They land in the **same account**. Magic link sets `emailVerified: true`, and
Google is a trusted provider, so Better Auth links the identities on the exact
email match.

`allowDifferentEmails` stays `false`, so linking only ever happens on an exact
address match — never across addresses.
</details>

<details>
<summary><b>G3.</b> Why is `requireEmailVerification` currently off, and why is that not a hole?</summary>

Email delivery is unreliable in this environment (Resend only delivers to the
account owner until a domain is verified), so requiring verification would
block signup entirely.

It is not a takeover hole because account linking still requires a **locally
verified** email. Someone squatting your address with a password cannot capture
your Google identity when you later sign in with it.

It is marked with a `ponytail:` comment naming the upgrade path.
</details>

<details>
<summary><b>G4.</b> Why does `getSession()` re-throw some errors instead of catching everything?</summary>

Next.js uses thrown errors as control flow — `DYNAMIC_SERVER_USAGE`,
`NEXT_REDIRECT`, `NEXT_NOT_FOUND`, tagged via a `digest` property. Swallowing
them breaks the framework.

Anything else is treated as signed-out, so a database blip renders the
signed-out state rather than blanking the page. The original version caught
everything and produced a flood of "failed to resolve session" logs during
build.
</details>

<details>
<summary><b>G5.</b> Why is every session query scoped by `userId` as well as `id`?</summary>

So a session id alone is never sufficient to read or mutate someone else's
data. Session ids are UUIDs but they appear in URLs and get shared; treating
them as capabilities would be an IDOR waiting to happen.

`abandonSession` originally missed this and was fixed.
</details>

<details>
<summary><b>G6.</b> Both providers walk a list of model ids. Why?</summary>

Both retire ids without notice. `gemini-2.0-flash` already 404s on this
project's key — verified by listing the models the key can actually see, rather
than trusting documentation.

Falling through on "model not found" means one retirement does not take the
product down.
</details>

---

## H. Traps

Short answers. These are the ones that cost real time.

<details>
<summary><b>H1.</b> Two `next dev` servers on one project — what breaks?</summary>

They share `.next` and both write `_buildManifest.js.tmp.*`, deleting each
other's temp files before the rename lands. Result: a flood of `ENOENT` and a
dead server. `.claude/launch.json` sets `autoPort: false` so a second start
refuses instead of competing.
</details>

<details>
<summary><b>H2.</b> `??` vs `||` for a user's name — why did `??` produce "Good evening, "?</summary>

Magic-link signup stores `name: ""`, not `null`. `??` only catches
null/undefined, so the empty string passed straight through. Use `||`, or
derive a name from the email local part.
</details>

<details>
<summary><b>H3.</b> An import error that contradicts a passing `tsc` — what is it?</summary>

A stale Turbopack dev cache, usually after an import and its usage landed in
separate edits. `taskkill /F /IM node.exe && rmdir /s /q .next && npm run dev`.
</details>

<details>
<summary><b>H4.</b> Why did `.env` render as `â”€â”€â”€`?</summary>

UTF-8 box-drawing characters read as Windows-1252. PowerShell 5.1's
`Get-Content -Raw` decodes as ANSI and `Set-Content -Encoding utf8` writes a
BOM. Fix: ASCII-only in config files, and never round-trip a UTF-8 source
through PS 5.1.
</details>

<details>
<summary><b>H5.</b> Why did every magic-link request 403 on a non-3000 port?</summary>

Better Auth's CSRF check trusts only `baseURL` by default. `trustedOrigins` now
covers Vercel preview URLs and — gated on `NODE_ENV` so it never ships — any
localhost port.
</details>

<details>
<summary><b>H6. ⭐</b> Running <code>npm run build</code> killed the dev server. Why?</summary>

Both `next build` and `next dev` write to `.next`. Run them together and they
delete each other's `_buildManifest.js.tmp.*` files before the rename lands —
an `ENOENT` flood and a dead server.

Same root cause as running two dev servers. **Never build while dev is
running.** Kill node, delete `.next`, restart.
</details>

<details>
<summary><b>H7.</b> A server action throws for an expected state. What does the user see?</summary>

"Application error: a server-side exception has occurred." Next renders the
error boundary — your message never arrives. Redirect, or render the state on
the page instead.
</details>

---

## Self-assessment

Rate yourself honestly on each area:

| Area | Can explain the *what* | Can defend the *why* | Could rebuild it |
| --- | --- | --- | --- |
| Architecture & layering | | | |
| Scoring philosophy | | | |
| Interview engine | | | |
| GD & debate | | | |
| Progress & gamification | | | |
| Monetization | | | |
| Design system | | | |
| Reliability & security | | | |

The middle column is the one interviews test. If you can state a decision but
not the alternative you rejected, go back to `decisions.md` — every entry names
what was rejected and why.

**The four to have ready cold:**

1. **B1** — countable vs judgement. The governing rule of the codebase, and the
   best thing to lead with.
2. **D3** — retries take the max, because averaging would punish the people
   using the Retry button properly.
3. **G1** — rate limiting counts the cost-tracking table, so it needed no new
   infrastructure and survives serverless.
4. **Fb4** — swapping the payment gateway touches two files, because
   entitlements were never scattered through the screens.

**If you only remember one sentence:** *anything countable is counted in code;
only judgements go to a model.* Almost every other decision in this project
falls out of that one.
