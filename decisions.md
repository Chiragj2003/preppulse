# PrepPulse — Decision Log

Every meaningful decision, and why it was taken. Newest phase last.

A decision earns a place here if reversing it would cost real work, or if a
future reader would otherwise reasonably ask "why on earth is it done this
way?". Routine choices are not recorded.

---

## Format

Each entry: **the decision**, the **why**, what was **rejected**, and how
you'd **reverse** it if the reasoning stops holding.

---

# Foundation

## D1. Next.js 15 App Router, server components by default

**Decision.** All data access happens in server components and server actions.
No client-side database calls, no REST layer for our own UI.

**Why.** The database URL and both LLM keys never reach the browser. It also
removes a whole class of work: no API route per screen, no fetch/loading/error
state for our own data, no client cache to invalidate.

**Rejected.** A separate REST or tRPC API. It buys type-safe client calls that
server actions already give us, at the cost of a layer to maintain.

**Reverse.** Wrap the functions in `lib/practice.ts` with route handlers. They
are already framework-agnostic.

## D2. Neon over HTTP, not a pooled TCP connection

**Decision.** `drizzle-orm/neon-http` with the serverless driver.

**Why.** One round trip per query and no connection pool to leak across
serverless invocations. On Vercel, a pool per lambda is a way to exhaust the
database's connection limit.

**Cost.** No interactive transactions. This is why Better Auth's adapter is
configured `transaction: false`.

**Reverse.** Swap to `neon-serverless` (WebSocket) if a flow genuinely needs
multi-statement atomicity.

## D3. The database client is a lazy Proxy

**Decision.** `db` is a `Proxy` that constructs the real client on first
property access, and binds methods to it.

**Why.** `next build` imports every module to collect page data. A client
constructed at import time would demand `DATABASE_URL` at build time, so a
build could not run without production secrets.

**Watch out.** Methods must be bound (`value.bind(cached)`), or `this` inside
Drizzle points at the proxy.

## D4. Environment variables are lazy getters

**Decision.** `lib/env.ts` exposes getters, not a validated object.

**Why.** Same reason as D3, one level up: importing the module must never
throw. Only the code path that needs a key complains, and it complains with
a sentence saying where to get it.

**Rejected.** Zod-validating the whole environment at boot. It fails the build
when a Phase 6 variable is missing.

## D5. A single git-ignored `.env`, ASCII only

**Decision.** One `.env`. No `.env.local`, no committed `.env.example`.

**Why.** The user asked for one file. ASCII-only because box-drawing characters
and em-dashes render as mojibake (`â”€`) in any editor that opens the file as
ANSI — which happened twice in this project, once in `.env` and once when a
PowerShell script rewrote `globals.css`.

**Rule that came out of it.** PowerShell 5.1's `Get-Content -Raw` decodes as
ANSI and `Set-Content -Encoding utf8` writes a BOM. Never round-trip a UTF-8
source file through it.

## D6. Better Auth with account linking on verified email

**Decision.** Google, magic link, email+password and email OTP all resolve to
one account per email address. `allowDifferentEmails` stays `false`.

**Why.** One human, one account, whichever door they use. Magic link and OTP
set `emailVerified: true`, so a later Google sign-in links into the existing
user rather than creating a duplicate.

**Security note.** `requireLocalEmailVerified` defaults to `true`, so someone
who pre-registers a victim's address with a password cannot capture that
victim's Google identity. This is why `requireEmailVerification: false` on
password signup is currently acceptable — see D19.

## D7. Rate limiting counts `ai_usage` rows

**Decision.** Per-user caps are enforced by counting rows already written to
`ai_usage` over a rolling minute and day.

**Why.** Every LLM call already writes that row for cost tracking. Counting it
needed no new table and no new infrastructure, and unlike an in-process counter
it survives across serverless invocations.

**Also.** It fails open. If the limiter itself errors, practice continues —
a broken limiter must not become a broken product.

**Reverse.** Phase 5 swaps the counter for Redis. No call site changes.

## D8. Provider errors never reach the UI

**Decision.** `lib/errors.ts` maps every 429 / 5xx / timeout / network failure
to a sentence the user can act on.

**Why.** A free tier hitting its limit mid-demo should look like a considered
message, not a stack trace. "The AI service is at its free-tier limit right
now. Your answer is saved — try scoring it again in a minute."

---

# Scoring

## D9. Countable things are counted in code; only judgements go to a model

**Decision.** This is the governing rule of the whole codebase.

Filler-word counts, speaking pace, words per minute, speaking share, turn
counts — all computed in TypeScript. Fluency, vocabulary, structure, clarity,
relevance — asked of the model.

**Why.** Language models are unreliable at counting and arithmetic, and
completely reliable at having an opinion. Asking a model "how many times did
they say um" invites a plausible wrong number that we would then display as
fact.

**Consequence.** `lib/scoring.ts`, `lib/interview-scoring.ts` and
`lib/gd-metrics.ts` contain no I/O at all, which is exactly why they can be
unit tested without a network.

## D10. The overall score is computed by us, never returned by the model

**Decision.** The model returns per-dimension scores. The composite is a
weighted sum in our code, from a per-mode weights table.

**Why.** A model asked for an overall score will not reliably agree with its
own component scores. Computing it ourselves means the headline number is
always consistent with the breakdown shown beneath it.

**Weights, extempore.** Structure 0.25, fluency 0.20, clarity 0.20, vocabulary
0.15, pace 0.10, filler control 0.10. Holding a shape under time pressure is
the harder skill, so structure outweighs vocabulary.

**Weights, interview.** Relevance 0.30, content 0.30, clarity 0.22, structure
0.18. A fluent answer to a question nobody asked is the most common way a real
round goes badly.

## D11. An unmeasurable dimension is excluded, not scored zero

**Decision.** Typed answers record `input_mode: 'typed'`; `weightedOverall`
drops pace and renormalises over the rest.

**Why.** Found in live testing: a good typed answer scored `227 wpm` and
`pace 10/100`, costing 12 points off the composite purely for using the
accessibility fallback for a blocked microphone. Penalising someone for not
having a working mic is indefensible.

**Rejected.** Scoring pace as a neutral 70. That is still a fabricated number
presented as a measurement.

**Guarded by.** A regression test in `scoring.test.ts`.

## D12. Provider split: Groq for speed, Gemini for depth

**Decision.** Groq scores extempore answers and drives discussion personas.
Gemini parses resumes and runs the interview.

**Why.** Different jobs. A group discussion has to answer in a couple of
seconds or the room stops feeling live, and Groq is built for that. Resume
parsing needs native PDF input and long context, which Gemini has and Groq
does not.

## D13. Both providers walk a model fallback list

**Decision.** Each client tries model ids in order and falls through on
"model not found".

**Why.** Both providers retire model ids without notice. `gemini-2.0-flash`
already 404s on this project's key — verified against its own `/models`
listing, not assumed. One retirement should not take the product down.

---

# Practice loop

## D14. The daily topic is shared by everyone and derived, not stored

**Decision.** `ORDER BY md5(topic_id || date) LIMIT 1`.

**Why.** Deterministic per calendar day with no scheduler, no cron and no
stored assignment. Shared across all users so Phase 5's leaderboard compares
like with like, and so the reveal feels like an event rather than a shuffle.

## D15. The rolled topic id is passed through the form

**Decision.** The Daily Roll posts `topicId` rather than the server re-picking.

**Why.** Quick Challenge picks randomly. Re-picking server-side would hand the
user a different topic than the one they just watched land.

## D16. Streaks use the client's local date, clamped

**Decision.** The browser sends `localDate`; the server accepts it only if it
is within one day of UTC today.

**Why.** "Did I practise today" is a question about the user's calendar. A 1am
session in IST is still today to them. The clamp stops it being used to
fabricate a streak.

## D17. `AnimatePresence` was removed, twice

**Decision.** Phase transitions and the Daily Roll reel use a keyed remount,
not `AnimatePresence`.

**Why.** Observed in the browser: exiting children were not unmounting. The
reel accumulated 13 stacked `<p>` elements, and the practice room rendered the
idle panel and the speaking panel simultaneously.

**Trade-off.** No exit animations. At 70ms swap intervals nobody sees an exit
anyway, and a stale panel left on screen is a far worse defect than a missing
fade.

## D18. Voice activity is a real Web Audio analyser

**Decision.** The waveform reads the microphone through an `AnalyserNode`.

**Why.** While recording, the only question that matters is "is it hearing
me?". A decorative loop that animates regardless actively lies about that.

**Degrades.** If `getUserMedia` is refused it renders a flat line and a note,
rather than pretending.

---

# Auth surface

## D19. Four sign-in methods behind two tabs

**Decision.** Google, password and email OTP are offered; magic link stays
wired server-side but is off the page. Password and OTP sit behind a two-way
segmented control.

**Why.** Four equal-weight buttons make people *choose* instead of sign in.
OTP and magic link do the same job — proving you own an inbox — so only one
needs to be visible.

**Also.** OTP codes are stored hashed. Six digits is short enough to brute
force from a database dump.

## D20. "Forgot password" routes to the email code, not a reset flow

**Decision.** No password reset page.

**Why.** Signing in with a code is already a complete recovery path, so nobody
is locked out. A reset flow is a token, an email template, a page and an
expiry policy — all of which can wait for a settings screen.

## D21. Email delivery falls back to the console in development

**Decision.** If the provider refuses, dev logs the link/code and carries on;
production still throws.

**Why.** Resend only delivers to the account owner's address until a domain is
verified, which would otherwise make sign-in untestable with any other address.

**Consequence.** The sign-in screen says so, for the whole of development. It
previously claimed "we sent a link" when nothing had been sent, which was
simply untrue.

---

# Design system

## D22. Dark-only, by art direction

**Decision.** No light theme. `color-scheme: dark`.

**Why.** "Near-black substrate, warm white ink" is the identity, not a user
preference. A light branch would be a second design to keep in sync for no
product gain.

## D23. Five material levels, and glass is rare

**Decision.** clear / dense / frost / liquid / solid. Most surfaces are not
glass.

**Why.** Glass reads as expensive because it is rare and sits against solids.
`backdrop-blur` on every card is the single clearest tell of a template.

**Detail that matters.** The specular edge is a masked gradient border,
brightest at the top-left where the light is. A flat `1px rgba(255,255,255,.1)`
border is what cheap glass looks like.

## D24. `@theme static` is mandatory

**Decision.** The Tailwind v4 theme block uses `static`.

**Why.** By default v4 only emits theme variables that a *generated utility*
references. Tokens consumed by hand-written CSS resolved to nothing — which
silently dropped the display font to system-ui and made every
`backdrop-filter` invalid, with no error anywhere.

## D25. Font variables belong on `<html>`, not `<body>`

**Decision.** next/font `.variable` classes are on the `<html>` element.

**Why.** A custom property is substituted where it is **declared**. `@theme`
declares `--font-sans` on `:root`; with `--font-geist-sans` defined only on
`<body>`, the `:root` declaration referenced an undefined variable, became
invalid, and every `font-family` silently fell through to preflight.

**How it was found.** Computed styles in the browser reported `-apple-system`
where Bricolage Grotesque was expected. Nothing errored.

## D26. Never hand-write `-webkit-backdrop-filter`

**Decision.** Write the standard property; let Lightning CSS prefix.

**Why.** Writing the prefixed form by hand made the build emit *only* the
prefixed property, which the target Chrome does not support
(`CSS.supports('-webkit-backdrop-filter', ...)` → `false`). Every glass surface
lost its blur.

---

# Interview (Phase 3)

## D27. The whole question set is generated before question one

**Decision.** One Gemini call produces all N questions, stored upfront.

**Why.** Generating question N+1 after seeing answer N is the obvious design
and the wrong one. It makes a session impossible to resume, and it lets the
interview drift toward whatever the candidate is comfortable with instead of
covering what the role tests.

**Cost.** The interview cannot adapt mid-round. Accepted: a real first-round
interviewer also works from a prepared list.

## D28. Each answer is analysed immediately, not banked to the end

**Decision.** `submitAnswer` returns a verdict per answer, plus a running
average.

**Why.** A candidate who rambled on question 3 should find out before they
answer question 4. Banking feedback until the end teaches nothing during the
session, which is the only time it could change behaviour.

**This is the trickiest logic in the app** — see `flow.md` for the sequence.

## D29. Retries keep the best attempt, and only the best

**Decision.** Answers are append-only, one row per attempt. The running
average and the aggregate both take `MAX(score)` per question.

**Why.** Averaging every attempt would mean pressing "Retry" and improving
still drags your average down — the button would punish exactly the people
using it properly. The original attempt is kept so the report can show a delta.

**Guarded by.** `interview-scoring.test.ts`, including the case where a *worse*
retry must not overwrite a better first attempt.

## D30. The uploaded PDF is never stored

**Decision.** The file lives in memory for one request. Only the extracted
JSON is persisted.

**Why.** It is the privacy position, and it means there is no bucket to secure,
no lifecycle policy and no orphaned-file cleanup. Guardrails (PDF only, 4MB,
non-empty) are enforced before anything reaches the model.

## D31. Mode-specific settings go in one `config` JSONB column

**Decision.** `practice_sessions.config` holds persona, question count, role,
stance, persona ids.

**Why.** One nullable column per mode-specific setting would mean a migration
for every new mode, and a table where most columns are null for most rows.

---

# Group discussion & debate (Phase 4)

## D32. One model call produces every persona's reaction

**Decision.** A single Groq call returns 2-3 turns from different panelists.

**Why.** Calling each persona separately would be N round trips, and every
persona would answer without having seen what the others just said — so they
would all talk past each other. Generating the exchange together is both
cheaper and the only way the panel argues with *itself*, which is what makes
it feel like a room.

## D33. The model tags each user turn; we tally the tags

**Decision.** The model returns `isRebuttal` and `introducesArgument` for the
user's turn. Those booleans are stored on the row. Metrics count rows.

**Why.** Consistent with D9. "Was that a rebuttal?" is a judgement. "How many
rebuttals?" is arithmetic.

**Bug this caused.** The optimistic client turn kept its untagged state, so the
live counters showed zero until a refresh. Fixed by returning the tags from the
action and patching the optimistic turn.

## D34. Presence is a band, and dominating is penalised like silence

**Decision.** Speaking share is judged against `100 / participants`, with a
window either side.

**Why.** In a real group discussion, taking 70% of the floor is a failure, not
a win. "More is better" would be the wrong lesson, so the verdict has a ceiling
as well as a floor.

## D35. Enter sends in the discussion composer

**Decision.** Enter sends; Shift+Enter breaks the line.

**Why.** A discussion is fast-moving. Reaching for a button every turn kills
the momentum that makes the mode worth doing.

---

# Progress & gamification (Phase 5)

## D36. Redis is optional, and everything falls back to Postgres

**Decision.** `lib/redis.ts` returns `null` on any miss, timeout or missing
credentials, and every caller treats `null` as "cache miss" and reads Postgres
instead.

**Why.** Upstash isn't configured on this project. Building the leaderboard
Redis-only would have shipped a feature that does nothing; building it
Postgres-only would have thrown away the reason Redis is in the stack at all.
The fallback means the feature is complete today and gets faster the moment
credentials appear.

**Rejected.** The `@upstash/redis` SDK. The REST protocol is
`POST ["CMD", ...]` with a bearer token — about a dozen lines for the six
commands used. Same reasoning as the Resend and Gemini clients.

**Reverse.** Delete the fallback in `lib/leaderboard.ts` once Redis is a hard
dependency.

## D37. Redis earns its place on two real jobs, not as decoration

**Decision.** Redis does the rolling leaderboard (sorted set) and cached topic
briefs (string with TTL). Nothing else.

**Why.** The plan was explicit that Redis had to be a genuine win. Reading the
top ten from a sorted set is one O(log N) command; the Postgres equivalent
scans a week of sessions, joins evaluations and users, groups and sorts — fine
at this size, wasteful on every homepage render at any real size.

## D38. Leaderboard keys are bucketed by ISO week

**Decision.** `lb:2026-w11`, with a TTL slightly longer than a week.

**Why.** The bucket expires on its own, so there is no trimming job and no way
to accumulate stale members forever. A single permanent key would need manual
eviction, which is a cron job nobody remembers to write.

## D39. A leaderboard shows first names only

**Decision.** First name, or the email local part if there is no name. Never
the full name, never the email.

**Why.** It is the one screen where other people's identities are on display.
Showing the least that still makes it feel like a room of humans is the correct
default, and it costs nothing.

## D40. Rest days are excluded from the trend, not counted as zero

**Decision.** `trend()` only averages days that were actually practised.

**Why.** Counting a rest day as a zero would make taking a weekend off look
like your speaking collapsed. The chart makes the same distinction visually:
the line breaks across a gap rather than interpolating through it, because
joining the gap would invent a score for a day nobody practised.

**Guarded by.** An explicit test asserting a two-day break scores a trend of 0.

## D41. The progress chart is hand-drawn SVG

**Decision.** No charting library.

**Why.** A library brings its own visual opinions — gridlines, tooltips, a
legend — that then need overriding to match the design system. Sixty lines of
SVG inherits the tokens directly, ships nothing to the browser (it's a server
component), and the y-axis is fixed at 0-100 so a four-point wobble can't be
auto-scaled into a cliff.

## D42. Badges are derived, understated, and locked ones stay visible

**Decision.** No badge table. Every badge is computed from streaks, session
counts and scores at render time. Locked badges are listed at 40% opacity.

**Why.** Awarding rows in a table means a backfill job whenever a threshold
changes; deriving them means changing a number in one file. Showing locked
badges gives something to aim at — a list of only what you've earned has no
forward motion.

**Tone.** No confetti, no arcade counters. Thresholds are 7/25/30 rather than
round-number vanity: seven days is a real habit, ninety is a genuinely rare
score.

## D43. The streak token bonus is capped

**Decision.** `tokensForSession` = 10 floor + score/5 + min(streak, 10).

**Why.** An uncapped streak multiplier would make week three worth more than
doing the work well, which is the wrong incentive for a practice tool. There's
a test asserting quality is always worth more than the streak bonus.

## D44. Sharing is opt-in, partial, and revocable

**Decision.** Off by default. A random 12-character slug, separate from the
session id. The public card shows the score, topic and breakdown — never the
transcript, the coaching notes or the person's name.

**Why.** Sharing a result should not mean publishing a recording of yourself
thinking aloud. The slug is separate from the id so a URL can't be
reverse-engineered, and revoking is a slug change rather than deleting the
session. A revoked share 404s identically to one that never existed.

---

# Monetization (Phase 6)

## D45. Prices live in the database, never in code

**Decision.** A `plans` table holds price, limits, features and unlocked modes.
`db/plans.ts` is a *seed*, not the source of truth.

**Why.** A price change should be a row update, not a deploy. Hardcoded prices
are also how the pricing page ends up disagreeing with the checkout screen.

**Money is stored in minor units** (paise) as an integer. Never a float.

## D46. One entitlement checkpoint, not scattered plan checks

**Decision.** `lib/gate.ts` is the only place that decides whether a user may
start something. `lib/billing.ts` holds the pure entitlement maths.

**Why.** Adding a plan must not mean hunting for `if (plan === 'pro')` across
the app, and there should be exactly one function to audit when asking "can
this user do this?".

## D47. The gate redirects; it does not throw

**Decision.** `gateOrRedirect` sends the user to `/pricing`. Pages separately
call `checkCanStart` and render a paywall instead of a start button.

**Why.** Found in live testing: throwing from a form action renders Next's
error boundary, so the carefully written explanation became
*"Application error: a server-side exception has occurred"*. The user saw a
crash where a paywall was intended.

**Both layers exist on purpose.** The page check is about honesty — never offer
a button that can't work. The action check is the security backstop, because a
server action can be called directly.

## D48. Subscription validity checks the date, not just the status

**Decision.** `isSubscriptionActive` requires `status === 'active'` **and** an
unexpired period.

**Why.** With a real gateway, a row can sit at `active` until a webhook
arrives. A webhook that never arrives must not grant free access forever.

## D49. The dummy gateway is one function

**Decision.** `capturePayment()` in `app/pricing/actions.ts` is the only thing
that knows how payment works. It fabricates a reference and returns success.

**Why.** The whole point of a scaffold is that replacing it is small. Swapping
in Stripe or Razorpay means changing that function and the checkout component,
plus adding a webhook — no schema migration, because `subscriptions` already
has `provider`, `provider_ref` and `current_period_end`.

**Honesty.** The checkout page says plainly that no gateway is connected and
that whatever is typed into the card fields is discarded. A fake payment form
that doesn't say it's fake is the wrong thing to ship, even in a portfolio.

## D50. The free tier includes the actual product

**Decision.** Daily practice, full scoring and coaching are free forever, with
a three-a-day cap. Paid tiers unlock the *other rooms*.

**Why.** The daily habit is what the product is for. Gating it would make the
free tier a demo rather than a product, and nobody builds a habit inside a
demo.

---

# Conversation & scenarios (Phase 7)

## D51. Role-play reuses the discussion engine entirely

**Decision.** Conversation and scenario modes use the same `discussion_turns`
table, the same `speak()` action and the same room component as group
discussion and debate. Only the counterpart and the brief change.

**Why.** The plan said "reuse Phase 2/3 recording and scoring infrastructure —
don't rebuild", and it was right. A conversation *is* a turn loop: read
history, send it with a brief, append replies. Building a second engine would
have been the same state machine with different labels and twice the surface
to keep in sync.

**What that bought.** Phase 7 added one data file, one prompt function, one
setup page and one action. The room, the transcript, the composer, the
optimistic append and the metrics came for free.

**Reverse.** If role-play ever needs something structurally different — branching
outcomes, a scored rubric per turn — split it then, not in anticipation.

## D52. Deflection is detected in code, not hoped away in the prompt

**Decision.** `isDeflection()` and `isRepetitive()` check every counterpart
reply. On a hit, we re-ask once with an instruction naming the specific
failure.

**Why.** The brief called out "avoid repetitive 'tell me more' responses"
explicitly, and for good reason: deflecting is *always* a safe reply for a
model, so it's the failure mode it falls into under any uncertainty. A reply
that is nothing but a short question means the counterpart contributed nothing
and the user is now doing all the work — which is the opposite of practice.

Telling the model not to do it helps. Checking whether it did is what actually
holds the line. Same principle as counting filler words rather than asking.

**One retry only.** A second failure ships the reply anyway rather than
spending the user's rate limit chasing perfection mid-conversation.

## D53. Contractions are expanded before repetition matching

**Decision.** `normalise()` expands `'s`, `n't`, `'re`, `'ll`, `'ve`, `'m`,
`'d` before comparing word sets.

**Why.** Found by a failing test. "that's a fair point" and "that is a fair
point" share only half their words once apostrophes are stripped, so a
straight repeat slipped through as novel. The test was right and the detector
was wrong.

## D54. The counterpart speaks first

**Decision.** Starting a role-play seeds turn 0 with the counterpart's scripted
opening line.

**Why.** A role-play that opens with an empty box puts the hardest part —
starting the scene — on the person who came to practise the *rest* of it. It
also sets the tone: "This is the second time. The SECOND time." tells you
instantly what kind of room you're in.

## D55. Role-play hides the airtime metrics

**Decision.** Speaking share, arguments and rebuttals are shown for group
discussion and debate, and hidden for conversation and scenario.

**Why.** They'd be actively misleading. A negotiation where you spoke 70% of
the words is not a failure — it might be exactly right. The presence band
exists to teach "don't dominate a panel", which is not a lesson that transfers
to a one-to-one.

---

# Admin & cost (Phase 8)

## D56. Admin access is an environment allowlist, failing closed

**Decision.** `ADMIN_EMAILS` is a comma-separated list. An empty list locks
everyone out.

**Why.** There is exactly one admin. A roles table, a permissions model and an
invite flow would all be machinery serving a single row. When there is a second
admin, add the column then.

**Failing closed matters.** An empty allowlist letting everyone in is the
classic way an access check becomes a hole after a config change.

## D57. Non-admins get 404, not 403

**Decision.** `notFound()` rather than a forbidden page.

**Why.** A 403 confirms the page exists. There is no reason to tell anyone
that, and no cost to not telling them.

## D58. Cost per session is the headline, not total spend

**Decision.** The admin page leads with cost per session, and excludes sessions
that made no AI calls from the denominator.

**Why.** Total spend on a portfolio project is a number near zero and tells you
nothing. Cost per session is the only figure that answers "does this scale" —
multiply it by the users you hope for and you have your answer. Including
abandoned sessions that never reached scoring would flatter the average and
hide the real number.

**Measured on real data:** $0.0005 per session.

## D59. Latency is reported as a median

**Decision.** `summarise()` computes median latency, not mean.

**Why.** One 45-second provider timeout in a sample of four would drag a mean
to ~11 seconds and make a healthy p50 of 850ms look broken. There's a test
asserting exactly that case.

## D60. The month projection is deliberately naive

**Decision.** Straight-line from days elapsed, labelled as an estimate in the
UI.

**Why.** With a handful of users there isn't enough signal for anything
cleverer, and a confident-looking forecast built on three days of data would be
worse than an obviously rough one.

---

# Open items

- `requireEmailVerification` is off while email delivery is unreliable. Marked
  with a `ponytail:` comment in `lib/auth.ts`. Turn on once a sending domain is
  verified.
- Upstash is not configured, so the leaderboard currently runs its Postgres
  path. Adding `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` switches
  it over with no code change.
- Cached topic briefs have a Redis helper (`getCached`/`setCached`) but nothing
  populates them yet — the brief generator is a Phase 10 polish item.
- Role-play sessions record turns but aren't scored against their
  `successLooksLike` criteria yet. The criteria are defined and displayed; the
  end-of-session verdict is a Phase 10 item.
- `ADMIN_EMAILS` must be set on Vercel as well as locally, or `/admin` 404s in
  production.
- The Turbopack dev CSS parser warns about `@layer properties;` in Tailwind's
  own generated output. Non-fatal; the production build is clean.
- `drizzle-kit` pulls a dev-only `esbuild` advisory through deprecated
  `@esbuild-kit/*` packages. Not in the production bundle.

---

# Operational traps

Recorded because each one cost real time and none produced a useful error.

| Trap | Symptom | Fix |
| --- | --- | --- |
| Two processes writing `.next` | `ENOENT ... _buildManifest.js.tmp.*` flood, dead server | Never run `next build` while `next dev` is running |
| Switching between build and dev | Same ENOENT flood on a *fresh* dev start | Leftover production artifacts also break dev. `npm run dev:clean` deletes `.next` first. |
| Stale Turbopack cache | An import error that contradicts a passing `tsc` | Delete `.next` and restart |
| PowerShell 5.1 round-trip | UTF-8 renders as `â”€`; a BOM appears | `Get-Content -Raw` decodes as ANSI, `Set-Content -Encoding utf8` writes a BOM. Use ASCII in config files. |
| `??` on a user's name | "Good evening, " with no name | Magic-link signup stores `""`, not null. Use `||`. |
| Better Auth on a non-3000 port | Every auth request 403s | `trustedOrigins` must cover the serving origin |
| Throwing from a form action | "Application error: a server-side exception" | Redirect instead; render the state on the page |
