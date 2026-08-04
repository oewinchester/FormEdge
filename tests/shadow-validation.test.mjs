import assert from "node:assert/strict";
import test from "node:test";
import {
  SHADOW_VALIDATION_SCHEMA_VERSION,
  evaluateShadowValidation,
} from "../lib/shadow-validation.ts";

test("stable temporal windows remain blocked when public retrospective data is not forward observed", () => {
  const result = evaluateShadowValidation({
    observations: observations(100),
    researchOnly: true,
    forwardObserved: false,
    commercialReuseVerified: false,
    revisionTimingVerified: false,
    evidenceCompleted: true,
    evidenceStatus: "blocked",
  });

  assert.equal(result.schemaVersion, SHADOW_VALIDATION_SCHEMA_VERSION);
  assert.equal(result.status, "stable");
  assert.equal(result.releaseEligibility, "blocked");
  assert.equal(result.earlyWindow.sampleCount, 50);
  assert.equal(result.lateWindow.sampleCount, 50);
  assert.equal(result.leakageViolationCount, 0);
  assert.ok(result.drift.checks.every((row) => row.passed));
  assert.deepEqual(
    result.blockers.map((row) => row.code),
    [
      "SOURCE_RESEARCH_ONLY",
      "COMMERCIAL_REUSE_UNVERIFIED",
      "REVISION_TIMING_UNVERIFIED",
      "NO_FORWARD_SHADOW_OBSERVATION",
    ],
  );
});

test("a material late-window quality collapse is marked unstable", () => {
  const rows = observations(100);
  for (const row of rows.slice(50)) {
    row.probabilities = row.actualOutcome === "1"
      ? { home: 0.02, draw: 0.08, away: 0.9 }
      : row.actualOutcome === "X"
        ? { home: 0.9, draw: 0.02, away: 0.08 }
        : { home: 0.9, draw: 0.08, away: 0.02 };
  }
  const result = evaluateShadowValidation({
    observations: rows,
    researchOnly: false,
    forwardObserved: true,
    commercialReuseVerified: true,
    revisionTimingVerified: true,
    evidenceCompleted: true,
    evidenceStatus: "candidate",
  });

  assert.equal(result.status, "unstable");
  assert.equal(result.releaseEligibility, "blocked");
  assert.ok(result.drift.logLossDelta > 1);
  assert.ok(result.blockers.some((row) => row.code === "TEMPORAL_STABILITY_GATE_FAILED"));
});

test("small windows cannot be promoted even when their observed metrics look strong", () => {
  const result = evaluateShadowValidation({
    observations: observations(30),
    researchOnly: false,
    forwardObserved: true,
    commercialReuseVerified: true,
    revisionTimingVerified: true,
    evidenceCompleted: true,
    evidenceStatus: "candidate",
  });

  assert.equal(result.status, "insufficient");
  assert.equal(result.releaseEligibility, "blocked");
  assert.ok(result.blockers.some((row) => row.code === "SAMPLE_WINDOW_TOO_SMALL"));
});

test("a point-in-time timestamp violation invalidates the complete validation", () => {
  const rows = observations(80);
  rows[10].featureCutoffAt = new Date(Date.parse(rows[10].predictionAt) + 60_000).toISOString();
  const result = evaluateShadowValidation({
    observations: rows,
    researchOnly: true,
    forwardObserved: false,
    commercialReuseVerified: false,
    revisionTimingVerified: false,
    evidenceCompleted: true,
  });

  assert.equal(result.status, "invalid");
  assert.equal(result.invalidObservationCount, 1);
  assert.equal(result.leakageViolationCount, 1);
  assert.ok(result.blockers.some((row) => row.code === "POINT_IN_TIME_VIOLATION"));
});

test("fully verified stable forward observations become a forward-shadow candidate", () => {
  const result = evaluateShadowValidation({
    observations: observations(100),
    researchOnly: false,
    forwardObserved: true,
    commercialReuseVerified: true,
    revisionTimingVerified: true,
    evidenceCompleted: true,
    evidenceStatus: "candidate",
  });

  assert.equal(result.status, "stable");
  assert.equal(result.releaseEligibility, "forward_shadow_candidate");
  assert.deepEqual(result.blockers, []);
});

function observations(count) {
  const start = Date.parse("2023-01-01T18:00:00.000Z");
  return Array.from({ length: count }, (_, index) => {
    const kickoff = start + index * 24 * 3_600_000;
    const actualOutcome = index % 3 === 0 ? "1" : index % 3 === 1 ? "X" : "2";
    const probabilities = actualOutcome === "1"
      ? { home: 0.94, draw: 0.04, away: 0.02 }
      : actualOutcome === "X"
        ? { home: 0.03, draw: 0.94, away: 0.03 }
        : { home: 0.02, draw: 0.04, away: 0.94 };
    return {
      fixtureId: `shadow-${String(index + 1).padStart(4, "0")}`,
      predictionAt: new Date(kickoff - 48 * 3_600_000).toISOString(),
      kickoffAt: new Date(kickoff).toISOString(),
      featureCutoffAt: new Date(kickoff - 48 * 3_600_000).toISOString(),
      resultKnownAt: new Date(kickoff + 3 * 3_600_000).toISOString(),
      actualOutcome,
      probabilities,
      dataCompleteness: 0.82,
    };
  });
}
