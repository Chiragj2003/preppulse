# Deep Dive: The PrepPulse Scoring Engine

A common failure mode when building AI applications is treating the LLM as a black-box oracle that can evaluate, count, and score simultaneously. 

Language models are exceptional at semantic understanding (e.g., "was this argument well-structured?"), but they are famously poor at deterministic counting and arithmetic (e.g., "how many times did the user say 'um', and what is the exact percentage score?"). 

To build a defensible, production-ready practice platform, PrepPulse splits the evaluation pipeline into **semantic judgement** (handled by the AI) and **deterministic measurement** (handled by pure TypeScript math).

## 1. Separation of Concerns: The `ai/score.ts` vs `scoring.ts` split

When a user submits a practice response, the system needs to evaluate six dimensions:
1. **Structure** (Semantic)
2. **Clarity** (Semantic)
3. **Fluency** (Semantic)
4. **Vocabulary** (Semantic)
5. **Filler Word Control** (Deterministic)
6. **Pacing** (Deterministic)

### The Anti-Pattern
The naive approach is to send the transcript to Groq/Gemini with the prompt: *"Score this out of 100 on structure, clarity, fluency, vocabulary, filler words, and pacing. Return a final composite score."*

This fails because:
- The LLM cannot accurately count filler words in a large text blob.
- The LLM has no access to the wall-clock time the user spent speaking, making pacing impossible to judge accurately.
- The LLM's composite score will drift based on temperature, rather than following a strict weighting algorithm.

### The PrepPulse Approach
Instead, the LLM is only asked to evaluate what it's good at. `src/lib/ai/score.ts` asks Groq strictly for the semantic scores (1-10) and qualitative feedback.

Meanwhile, `src/lib/scoring.ts` takes over the deterministic work. It performs regex-based exact counting of filler words (um, ah, like, you know) against the raw transcript. It calculates words-per-minute (WPM) using the client-provided `durationSeconds`.

## 2. The Weighted Composite (Pure Math)

Once the four semantic scores arrive from the AI and the two deterministic scores are computed locally, the system generates the `overallScore`.

Crucially, **the LLM never calculates the final score.**

The final score is a weighted composite calculated in `lib/scoring.ts`. This ensures:
1. **Predictability:** The same sub-scores will always produce the exact same final score.
2. **Pedagogical Tuning:** We can adjust the weights without touching the AI prompt. For example, in Extempore mode, *Structure* is weighted heavily (25%) because maintaining a coherent shape under time pressure is the core skill being tested. *Vocabulary* is weighted lower (15%) to avoid penalizing non-native speakers who speak clearly but simply.

```typescript
const weights = {
  structure: 0.25,
  clarity: 0.20,
  fluency: 0.20,
  fillerControl: 0.15,
  vocabulary: 0.10,
  pace: 0.10,
};
```

## 3. Handling Unmeasurable Dimensions

In a real-world application, accessibility matters. PrepPulse offers a text-input fallback for users who cannot use the microphone or are in a noisy environment.

When an answer is typed, it takes zero seconds of speaking time. A naive scoring engine would record `duration: 0`, calculate `WPM: 0`, assign a Pace score of `0/100`, and drag the user's overall average down.

PrepPulse handles this by filtering out unmeasurable dimensions based on the `inputMode`. If the mode is `"text"`, the Pace score is omitted, and the weights of the remaining five dimensions are re-normalized to sum to 1.0. The user gets a fair score, and the UI displays `N/A` for Pacing with a tooltip explaining why.

## Conclusion

By keeping arithmetic, counting, and composite weighting entirely in TypeScript, and restricting the LLM to semantic evaluation, the PrepPulse scoring engine achieves high reliability, testability (via `node:test`), and pedagogical fairness. It stops trusting the AI to do math, and instead uses it solely for judgement.
