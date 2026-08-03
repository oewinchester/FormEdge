import assert from "node:assert/strict";
import test from "node:test";
import {
  MATERIAL_PROBABILITY_SHIFT,
  assessMaterialChange,
  canonicalPredictionJson,
  choosePredictionTrigger,
  evaluateFinalizationGate,
  predictionIdentity,
  transitionPredictionStatus,
} from "../lib/prediction-lifecycle.ts";

test("the lifecycle rejects illegal transitions and preserves status for immutable rescores", () => {
  assert.equal(transitionPredictionStatus(null, "watchlisted"), "watchlist");
  assert.equal(transitionPredictionStatus("watchlist", "versioned"), "watchlist");
  assert.equal(transitionPredictionStatus("final", "versioned"), "final");
  assert.equal(transitionPredictionStatus("withdrawn", "versioned"), "withdrawn");
  assert.equal(transitionPredictionStatus("watchlist", "finalized"), "final");
  assert.equal(transitionPredictionStatus("final", "withdrawn"), "withdrawn");
  assert.equal(transitionPredictionStatus("withdrawn", "reopened"), "watchlist");
  assert.equal(transitionPredictionStatus("watchlist", "expired"), "expired");
  assert.throws(() => transitionPredictionStatus("expired", "versioned"), /not allowed/i);
  assert.throws(() => transitionPredictionStatus("final", "finalized"), /not allowed/i);
  assert.throws(() => transitionPredictionStatus("withdrawn", "finalized"), /not allowed/i);
});

test("finalization opens only when every lineup, data, release and source gate passes", () => {
  const ready = snapshot();
  assert.deepEqual(evaluateFinalizationGate(ready), { eligible: true, blockers: [] });

  const blocked = evaluateFinalizationGate({
    ...ready,
    lineupState: "probable",
    dataCompleteness: 0.84,
    releaseGateAllowed: false,
    researchOnly: true,
    contextCompleteness: 0.79,
    contextEligible: false,
  });
  assert.equal(blocked.eligible, false);
  assert.deepEqual(blocked.blockers, [
    "LINEUPS_NOT_CONFIRMED",
    "DATA_COMPLETENESS_LOW",
    "CONTEXT_INCOMPLETE",
    "RELEASE_GATE_CLOSED",
    "SOURCE_RESEARCH_ONLY",
  ]);
});

test("a final forecast becomes material at the documented probability threshold", () => {
  const previous = snapshot();
  const below = assessMaterialChange(previous, {
    ...previous,
    probabilities: { home: 0.579, draw: 0.261, away: 0.16 },
  });
  assert.equal(below.material, false);

  const atThreshold = assessMaterialChange(previous, {
    ...previous,
    probabilities: {
      home: previous.probabilities.home - MATERIAL_PROBABILITY_SHIFT,
      draw: previous.probabilities.draw + MATERIAL_PROBABILITY_SHIFT,
      away: previous.probabilities.away,
    },
  });
  assert.equal(atThreshold.material, true);
  assert.ok(atThreshold.reasons.includes("PROBABILITY_SHIFT"));

  const lineupChanged = assessMaterialChange(previous, {
    ...previous,
    lineupFingerprint: "lineup-sha-v2",
  });
  assert.equal(lineupChanged.material, true);
  assert.ok(lineupChanged.reasons.includes("LINEUP_CHANGED_AFTER_FINAL"));
});

test("canonical identities are key-order independent and evidence-sensitive", async () => {
  assert.equal(
    canonicalPredictionJson({ z: 2, a: { y: 4, x: 3 } }),
    canonicalPredictionJson({ a: { x: 3, y: 4 }, z: 2 }),
  );
  const first = await predictionIdentity({ fixtureId: "fixture-1", probability: 0.58, lineup: ["a", "b"] });
  const reordered = await predictionIdentity({ lineup: ["a", "b"], probability: 0.58, fixtureId: "fixture-1" });
  const changed = await predictionIdentity({ fixtureId: "fixture-1", probability: 0.59, lineup: ["a", "b"] });
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first, reordered);
  assert.notEqual(first, changed);
});

test("lineup arrival selects an event-driven rescore trigger", () => {
  assert.equal(choosePredictionTrigger({ existingVersionCount: 0, previousLineupState: null, currentLineupState: "none", fixtureStatus: "scheduled" }), "initial_window");
  assert.equal(choosePredictionTrigger({ existingVersionCount: 1, previousLineupState: "none", currentLineupState: "probable", fixtureStatus: "scheduled" }), "lineup_probable");
  assert.equal(choosePredictionTrigger({ existingVersionCount: 2, previousLineupState: "probable", currentLineupState: "confirmed", fixtureStatus: "scheduled" }), "lineup_confirmed");
  assert.equal(choosePredictionTrigger({ existingVersionCount: 2, previousLineupState: "confirmed", currentLineupState: "confirmed", fixtureStatus: "scheduled" }), "scheduled_refresh");
  assert.equal(choosePredictionTrigger({ existingVersionCount: 2, previousLineupState: "confirmed", currentLineupState: "confirmed", fixtureStatus: "postponed" }), "fixture_status_change");
});

function snapshot() {
  return {
    versionId: "version-1",
    predictionAt: "2026-08-03T12:00:00.000Z",
    kickoffAt: "2026-08-04T18:00:00.000Z",
    fixtureStatus: "scheduled",
    probabilities: { home: 0.58, draw: 0.26, away: 0.16 },
    predictedOutcome: "1",
    dataCompleteness: 0.92,
    lineupState: "confirmed",
    lineupFingerprint: "lineup-sha-v1",
    contextFingerprint: "context-sha-v1",
    contextCompleteness: 0.92,
    contextEligible: true,
    releaseGateAllowed: true,
    researchOnly: false,
    featureFingerprint: "feature-sha-v1",
  };
}
