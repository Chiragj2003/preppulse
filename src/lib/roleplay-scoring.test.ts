import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scoreRoleplay } from "./roleplay-scoring";

describe("scoreRoleplay", () => {
  it("should return high score when all criteria met and good participation", () => {
    const result = scoreRoleplay({
      criteriaResults: [true, true, true],
      turnCount: 10,
      userTurnCount: 5, // 50% ratio (ideal)
    });
    
    assert.equal(result.criteriaHitRate, 100);
    assert.equal(result.participationScore, 100);
    assert.equal(result.engagementScore, 100); // 5 turns >= 3
    assert.equal(result.overallScore, 100);
  });

  it("should return low criteria hit rate when no criteria met", () => {
    const result = scoreRoleplay({
      criteriaResults: [false, false],
      turnCount: 10,
      userTurnCount: 5,
    });
    
    assert.equal(result.criteriaHitRate, 0);
    assert.equal(result.participationScore, 100);
    assert.equal(result.engagementScore, 100);
    assert.equal(result.overallScore, 50); // 0*0.5 + 100*0.25 + 100*0.25
  });

  it("should return low participation and engagement when too few user turns", () => {
    const result = scoreRoleplay({
      criteriaResults: [true],
      turnCount: 10,
      userTurnCount: 1, // 10% ratio
    });
    
    assert.equal(result.criteriaHitRate, 100);
    assert.equal(result.participationScore, 25); // (0.1 / 0.4) * 100
    assert.equal(result.engagementScore, 33); // (1/3) * 100 = 33.33 -> clamped to 33
    // overall: 100*0.5 + 25*0.25 + 33.33*0.25 = 50 + 6.25 + 8.33 = 64.58 -> clamped to 65
    assert.equal(result.overallScore, 65);
  });

  it("should return lower participation when user dominates conversation", () => {
    const result = scoreRoleplay({
      criteriaResults: [true],
      turnCount: 10,
      userTurnCount: 9, // 90% ratio
    });
    
    assert.equal(result.criteriaHitRate, 100);
    assert.equal(result.participationScore, 25); // ((1 - 0.9) / 0.4) * 100
    assert.equal(result.engagementScore, 100);
    // overall: 100*0.5 + 25*0.25 + 100*0.25 = 50 + 6.25 + 25 = 81.25 -> clamped to 81
    assert.equal(result.overallScore, 81);
  });

  it("should return 0 criteriaHitRate for empty criteria array", () => {
    const result = scoreRoleplay({
      criteriaResults: [],
      turnCount: 4,
      userTurnCount: 2,
    });
    
    assert.equal(result.criteriaHitRate, 0);
    assert.equal(result.participationScore, 100);
    assert.equal(result.engagementScore, 67); // (2/3) * 100 = 66.66 -> clamped to 67
    // overall: 0*0.5 + 100*0.25 + 66.66*0.25 = 25 + 16.66 = 41.66 -> clamped to 42
    assert.equal(result.overallScore, 42);
  });

  it("should return all 0s for 0 total turns (edge case)", () => {
    const result = scoreRoleplay({
      criteriaResults: [true],
      turnCount: 0,
      userTurnCount: 0,
    });
    
    assert.equal(result.criteriaHitRate, 0);
    assert.equal(result.participationScore, 0);
    assert.equal(result.engagementScore, 0);
    assert.equal(result.overallScore, 0);
  });

  it("should score appropriately for minimum viable conversation", () => {
    const result = scoreRoleplay({
      criteriaResults: [true, false], // 50% hit rate
      turnCount: 6,
      userTurnCount: 3, // exactly 3 user turns, 50% ratio
    });
    
    assert.equal(result.criteriaHitRate, 50);
    assert.equal(result.participationScore, 100);
    assert.equal(result.engagementScore, 100);
    // overall: 50*0.5 + 100*0.25 + 100*0.25 = 25 + 25 + 25 = 75
    assert.equal(result.overallScore, 75);
  });
});
