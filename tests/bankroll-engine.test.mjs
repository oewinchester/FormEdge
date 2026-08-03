import assert from "node:assert/strict";
import test from "node:test";
import { BANKROLL_POLICY, calculateStakeRecommendation } from "../lib/bankroll-engine.ts";

test("quarter Kelly is capped by risk profile and never changes the probability", () => {
  const result = calculateStakeRecommendation({
    bankroll: 10_000,
    currentOpenExposure: 0,
    modelProbability: 0.64,
    decimalOdds: 2,
    riskProfile: "balanced",
    kind: "single",
  });
  assert.equal(result.modelProbability, 0.64);
  assert.equal(result.recommendedFraction, BANKROLL_POLICY.profileCaps.balanced.single);
  assert.equal(result.recommendedStake, 125);
  assert.ok(result.flags.includes("PROFILE_STAKE_CAP_APPLIED"));
});

test("negative edge and full exposure return a zero stake", () => {
  const noEdge = calculateStakeRecommendation({
    bankroll: 1_000,
    currentOpenExposure: 0,
    modelProbability: 0.4,
    decimalOdds: 2,
    riskProfile: "bold",
    kind: "single",
  });
  assert.equal(noEdge.recommendedStake, 0);
  assert.ok(noEdge.flags.includes("NO_POSITIVE_EDGE"));

  const capped = calculateStakeRecommendation({
    bankroll: 1_000,
    currentOpenExposure: 50,
    modelProbability: 0.7,
    decimalOdds: 2,
    riskProfile: "balanced",
    kind: "single",
  });
  assert.equal(capped.recommendedStake, 0);
  assert.ok(capped.flags.includes("OPEN_EXPOSURE_CAP_REACHED"));
});

test("coupon limits are always lower than single limits", () => {
  for (const profile of ["cautious", "balanced", "bold"]) {
    assert.ok(BANKROLL_POLICY.profileCaps[profile].coupon < BANKROLL_POLICY.profileCaps[profile].single);
  }
});
