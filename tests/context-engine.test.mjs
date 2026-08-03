import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTEXT_ENGINE_POLICY,
  evaluateFixtureContext,
} from "../lib/context-engine.ts";

test("context shifts are bounded and do not mutate base probabilities", () => {
  const base = { home: 0.58, draw: 0.25, away: 0.17 };
  const result = evaluateFixtureContext(context({ baseProbabilities: base }));
  assert.deepEqual(result.baseProbabilities, base);
  assert.ok(result.adjustedProbabilities.home > base.home);
  assert.ok(result.maximumProbabilityShift <= CONTEXT_ENGINE_POLICY.maximumProbabilityShift);
  assert.ok(Math.abs(Object.values(result.adjustedProbabilities).reduce((sum, value) => sum + value, 0) - 1) < 1e-7);
});

test("missing, stale or future context closes recommendation eligibility", () => {
  const incomplete = evaluateFixtureContext(context({ completeness: 0.79 }));
  assert.equal(incomplete.recommendationContextEligible, false);
  assert.ok(incomplete.blockers.includes("CONTEXT_INCOMPLETE"));

  const stale = evaluateFixtureContext(context({ capturedAt: "2026-08-04T04:00:00.000Z" }));
  assert.ok(stale.blockers.includes("CONTEXT_STALE"));

  const future = evaluateFixtureContext(context({ capturedAt: "2026-08-04T12:01:00.000Z" }));
  assert.ok(future.blockers.includes("CONTEXT_CAPTURE_AFTER_PREDICTION"));
});

test("derby, weather and recent coach changes shrink certainty without directional assumptions", () => {
  const neutral = evaluateFixtureContext(context({
    home: team(),
    away: team(),
    match: { weatherSeverity: 0, pitchQuality: 1, derby: false },
  }));
  const uncertain = evaluateFixtureContext(context({
    home: team({ coachDaysInRole: 5 }),
    away: team({ coachDaysInRole: 5 }),
    match: { weatherSeverity: 1, pitchQuality: 0, derby: true },
  }));
  assert.equal(uncertain.directionalLogit, 0);
  assert.ok(uncertain.uncertaintyShrink > neutral.uncertaintyShrink);
  assert.ok(uncertain.adjustedProbabilities.home < neutral.adjustedProbabilities.home);
});

function context(overrides = {}) {
  return {
    fixtureId: "fixture-1",
    capturedAt: "2026-08-04T10:00:00.000Z",
    predictionAt: "2026-08-04T12:00:00.000Z",
    kickoffAt: "2026-08-04T18:00:00.000Z",
    completeness: 0.92,
    baseProbabilities: { home: 0.58, draw: 0.25, away: 0.17 },
    home: team({ travelKm: 10, restHours: 120, importantPlayerForm: 0.4 }),
    away: team({
      unavailablePlayers: [{ playerId: "away-star", reason: "injury", importance: 0.9 }],
      travelKm: 1100,
      restHours: 72,
      importantPlayerForm: -0.2,
    }),
    match: { weatherSeverity: 0.2, pitchQuality: 0.9, derby: false },
    ...overrides,
  };
}

function team(overrides = {}) {
  return {
    unavailablePlayers: [],
    coachDaysInRole: 180,
    importantPlayerForm: 0,
    travelKm: 100,
    restHours: 96,
    ...overrides,
  };
}
