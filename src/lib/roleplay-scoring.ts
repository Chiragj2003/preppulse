/**
 * Input metrics for scoring a roleplay session.
 */
export type RoleplayScoreInput = {
  criteriaResults: boolean[];
  turnCount: number;
  userTurnCount: number;
};

/**
 * Resulting scores for a roleplay session.
 */
export type RoleplayScoreResult = {
  criteriaHitRate: number;
  participationScore: number;
  engagementScore: number;
  overallScore: number;
};

/**
 * Clamps a number between 0 and 100 and rounds to the nearest integer.
 */
function clamp(n: number): number {
  return Math.round(Math.max(0, Math.min(100, n)));
}

/**
 * Scores a role-play session against success criteria and conversational metrics.
 * This is a pure-math module, avoiding any I/O or AI judgements.
 *
 * @param input - The roleplay session metrics (criteria results, total turns, user turns)
 * @returns The clamped and rounded score breakdown
 */
export function scoreRoleplay(input: RoleplayScoreInput): RoleplayScoreResult {
  const { criteriaResults, turnCount, userTurnCount } = input;

  if (turnCount === 0) {
    return {
      criteriaHitRate: 0,
      participationScore: 0,
      engagementScore: 0,
      overallScore: 0,
    };
  }

  // 1. Criteria Hit Rate: Percentage of criteria successfully met
  let criteriaHitRate = 0;
  if (criteriaResults.length > 0) {
    const metCount = criteriaResults.filter(Boolean).length;
    criteriaHitRate = (metCount / criteriaResults.length) * 100;
  }

  // 2. Participation Score: Ideal user participation is 40%-60% of total turns
  // Outside of this range, the score linearly decreases.
  let participationScore = 0;
  const ratio = userTurnCount / turnCount;
  
  if (ratio >= 0.4 && ratio <= 0.6) {
    participationScore = 100;
  } else if (ratio < 0.4) {
    // Linearly scale from 0 to 100 as ratio approaches 0.4
    participationScore = (ratio / 0.4) * 100;
  } else {
    // Linearly scale down from 100 to 0 as ratio approaches 1.0 (overly dominating)
    participationScore = ((1 - ratio) / 0.4) * 100;
  }

  // 3. Engagement Score: Based on user turn count, min 3 for full marks (meaningful conversation)
  const engagementScore = Math.min(100, (userTurnCount / 3) * 100);

  // 4. Overall Score: Weighted composite (50% hit rate, 25% participation, 25% engagement)
  const overallScore =
    criteriaHitRate * 0.5 + participationScore * 0.25 + engagementScore * 0.25;

  return {
    criteriaHitRate: clamp(criteriaHitRate),
    participationScore: clamp(participationScore),
    engagementScore: clamp(engagementScore),
    overallScore: clamp(overallScore),
  };
}
