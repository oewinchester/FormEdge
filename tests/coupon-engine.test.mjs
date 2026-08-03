import assert from "node:assert/strict";
import test from "node:test";
import { evaluateCoupon, generateCouponAlternatives } from "../lib/coupon-engine.ts";

test("same fixture, repeated team and league concentration are blocked", () => {
  const sameFixture = evaluateCoupon([candidate(1), candidate(2, { fixtureId: "fixture-1" })], "balanced");
  assert.ok(sameFixture.blockers.includes("SAME_FIXTURE_CORRELATION"));

  const repeatedTeam = evaluateCoupon([
    candidate(1),
    candidate(2, { homeTeamId: "home-1" }),
  ], "balanced");
  assert.ok(repeatedTeam.blockers.includes("REPEATED_TEAM_EXPOSURE"));

  const concentrated = evaluateCoupon([
    candidate(1, { leagueId: "league-a" }),
    candidate(2, { leagueId: "league-a" }),
    candidate(3, { leagueId: "league-a" }),
  ], "balanced");
  assert.ok(concentrated.blockers.includes("LEAGUE_CONCENTRATION"));
});

test("generator is deterministic and returns only guarded alternatives", () => {
  const pool = Array.from({ length: 8 }, (_, index) => candidate(index + 1, {
    leagueId: `league-${(index % 4) + 1}`,
    decimalOdds: 1.7 + index * 0.08,
  }));
  const first = generateCouponAlternatives(pool);
  const second = generateCouponAlternatives([...pool].reverse());
  assert.deepEqual(first, second);
  assert.equal(first.singles.length, 5);
  assert.ok(first.balanced.length > 0);
  assert.ok(first.balanced.every((item) => item.evaluation.eligible));
  assert.ok(first.highOdds.every((item) => item.evaluation.eligible));
});

function candidate(index, overrides = {}) {
  return {
    id: `value-${index}`,
    fixtureId: `fixture-${index}`,
    leagueId: `league-${index}`,
    homeTeamId: `home-${index}`,
    awayTeamId: `away-${index}`,
    selection: "1",
    modelProbability: 0.62 - index * 0.005,
    decimalOdds: 1.9,
    expectedValue: 0.08 - index * 0.002,
    edge: 0.07 - index * 0.002,
    valueTier: "value",
    recommendationEligible: true,
    ...overrides,
  };
}
