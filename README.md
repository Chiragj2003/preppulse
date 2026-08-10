# PrepPulse

AI communication practice. Roll a topic you didn't see coming, talk for two
minutes, and get told exactly where you rambled, where you filled, and where you
actually landed it.

Interview prep is in here too — but it's deliberately the *second* thing you see,
not the pitch. Most people who want to get better at speaking aren't preparing
for an interview this week.

---

## Status

| Phase | Scope | State |
| --- | --- | --- |
| 1 | Foundation — auth, schema, rate limiting, landing + dashboard | Done |
| 2 | Random Topic / Extempore + Daily Roll (Groq) | In progress |
| 3 | Mock Interview (Gemini) + resume-driven recommendation | Not started |
| 4 | Group Discussion + Debate (Groq) | Not started |
| 5 | Progress, gamification & Redis | Not started |
| 6 | Monetization scaffold | Not started |
| 7 | Conversation & real-world scenario modes | Not started |
| 8 | Admin & cost tracking | Groundwork in place (`ai_usage` written on every call) |
| 9 | Hinglish / Hindi language support | Groundwork in place (schema + prompt hooks) |
| 10 | Polish pass | Not started |
| 11 | Portfolio polish | Not started |

---

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | Next.js 15 (App Router) + TypeScript | Server components keep the database off the client |
| Hosting | Vercel | Zero-config for Next, generous free tier |
| Database | Neon Postgres + Drizzle ORM | Serverless Postgres; Drizzle gives real SQL with real types |
| Auth | Better Auth | Google + magic link, no password storage to get wrong |
| Fast LLM | Groq | Scoring wants low latency more than depth |
| Deep LLM | Gemini | Resume parsing and long interview context (Phase 3) |
| Speech | Web Speech API | Free, on-device, no audio ever leaves the browser |

## Setup

```bash
npm install
cp .env .env.backup   # if you already have one
npm run db:migrate    # create tables in Neon
npm run db:seed       # load the 50 starter topics
npm run dev
```

Then open http://localhost:3000.

### Environment

All secrets live in a single git-ignored `.env`. Only `DATABASE_URL`,
`BETTER_AUTH_SECRET` and `GROQ_API_KEY` are needed to run Phases 1–2.

| Variable | Required | Source |
| --- | --- | --- |
| `DATABASE_URL` | yes | Neon → Connection string (pooled) |
| `BETTER_AUTH_SECRET` | yes | `openssl rand -base64 32` |
| `GROQ_API_KEY` | yes (Phase 2) | console.groq.com |
| `GEMINI_API_KEY` | Phase 3 | aistudio.google.com |
| `GOOGLE_CLIENT_ID` / `_SECRET` | no | Google Cloud Console — magic link works without it |
| `RESEND_API_KEY` | no | Without it, magic links print to the dev terminal |
| `RATE_LIMIT_PER_MINUTE` / `_PER_DAY` | no | Defaults 6 / 60 |

### Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:generate` | Generate SQL migration from the Drizzle schema |
| `npm run db:migrate` | Apply migrations to Neon |
| `npm run db:seed` | Load / refresh the topic pool (idempotent) |
| `npm run db:studio` | Drizzle Studio |

---

## How it's put together

```
src/
  app/
    page.tsx                  landing — fun modes first, interview prep second
    sign-in/                  Google + magic link
    dashboard/                streak, recent sessions, empty states
    practice/
      page.tsx                Daily Roll reveal
      actions.ts              server actions: start session, evaluate, abandon
      [sessionId]/            practice room + report
    api/auth/[...all]/        Better Auth handler
  db/
    auth-schema.ts            Better Auth tables (generated)
    app-schema.ts             topics, sessions, evaluations, profiles, usage, streaks
    topics.ts                 the 50 seed topics
  lib/
    scoring.ts                pure scoring maths — no I/O, unit-testable
    ai/score.ts               the Groq call
    rate-limit.ts             per-user caps
    errors.ts                 provider errors → human sentences
```

### Three decisions worth explaining

**The scoring engine doesn't trust the model with arithmetic.**
Six dimensions are scored, but only four of them come from Groq. Filler-word
control and speaking pace are *measured* in `lib/scoring.ts` — counted from the
transcript and the clock — because they're countable facts, and language models
are unreliable at counting. The overall score is then a weighted composite
computed in our code, never a number the model returned. Structure is weighted
highest for extempore (0.25); vocabulary lowest of the judged four (0.15),
because holding a shape under time pressure is the harder skill.

**Rate limiting reuses the cost-tracking table.**
Every LLM call already writes a row to `ai_usage` for Phase 8 cost reporting. The
limiter counts those rows per user over a rolling minute and day, so per-user
caps needed no new table and no new infrastructure — and unlike an in-process
counter, it survives across serverless invocations. Phase 5 swaps the counter for
Redis without touching a single call site.

**Raw provider errors never reach the UI.**
`lib/errors.ts` translates every 429 / 5xx / timeout into a sentence a person can
act on ("The AI service is at its free-tier limit right now. Your answer is
saved — try scoring it again in a minute."). A broken free tier should look like
a considered message, not a stack trace.

---

## Notes

- `drizzle-kit` pulls a dev-only `esbuild` advisory through the deprecated
  `@esbuild-kit/*` packages. It affects `esbuild serve`, which drizzle-kit never
  runs, and it isn't part of the production bundle. Production dependencies audit
  clean.
- Audio is never written to disk or uploaded. Transcription happens in the
  browser via the Web Speech API; only the resulting text is stored.
