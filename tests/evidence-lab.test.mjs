import assert from "node:assert/strict";
import test from "node:test";
import {
  ABLATION_SCHEMA_VERSION,
  EVIDENCE_MODEL_CODES,
  FORM_ABLATION_CODES,
  applyTemperatureScaling,
  evaluateProbabilityMetrics,
  fitTemperatureScaling,
  runEvidenceAnalysis,
  splitTemporalEvidence,
} from "../lib/evidence-lab.ts";

test("temperature scaling preserves ranking and normalized probabilities", () => {
  const raw = { home: 0.72, draw: 0.18, away: 0.1 };
  const softened = applyTemperatureScaling(raw, 1.8);

  assert.equal(maxKey(softened), "home");
  assert.ok(softened.home < raw.home);
  assert.ok(softened.away > raw.away);
  assert.ok(Math.abs(Object.values(softened).reduce((sum, value) => sum + value, 0) - 1) < 1e-7);
});

test("temperature is learned only when calibration log loss improves materially", () => {
  const observations = makeObservations(120, { overconfident: true });
  const fit = fitTemperatureScaling(
    observations,
    (observation) => observation.forecasts["elo-baseline"],
  );

  assert.ok(fit.fittedTemperature > 1);
  assert.equal(fit.accepted, true);
  assert.equal(fit.selectedTemperature, fit.fittedTemperature);
  assert.ok(fit.calibrationFittedLogLoss < fit.calibrationRawLogLoss);
});

test("development, calibration and holdout stay chronological with an embargo", () => {
  const partition = splitTemporalEvidence(makeObservations(180));
  const latestDevelopmentResult = Math.max(...partition.development.map((row) => Date.parse(row.resultKnownAt)));
  const latestCalibrationResult = Math.max(...partition.calibration.map((row) => Date.parse(row.resultKnownAt)));

  assert.ok(latestDevelopmentResult <= Date.parse(partition.calibration[0].kickoffAt) - 6 * 3_600_000);
  assert.ok(latestCalibrationResult <= Date.parse(partition.holdout[0].kickoffAt) - 6 * 3_600_000);
  assert.ok(partition.development.length > partition.calibration.length);
  assert.equal(partition.holdout.length, 36);
});

test("H2H cannot be selected from a small development slice even when it looks best", () => {
  const result = runEvidenceAnalysis({
    observations: makeObservations(180, { perfectH2h: true }),
    researchOnly: true,
  });

  assert.equal(result.ablation.selectedFormVariant, "full");
  assert.match(result.ablation.selectionReason, /H2H/);
  assert.ok(result.ablation.variants.find((row) => row.code === "h2h-12").metrics.logLoss
    < result.ablation.variants.find((row) => row.code === "full").metrics.logLoss);
});

test("mutating holdout outcomes cannot change ablation or calibration choices", () => {
  const observations = makeObservations(180, { overconfident: true });
  const first = runEvidenceAnalysis({ observations, researchOnly: true });
  const mutated = structuredClone(observations);
  for (const observation of mutated.slice(-36)) {
    observation.actualOutcome = observation.actualOutcome === "1" ? "2" : "1";
  }
  const second = runEvidenceAnalysis({ observations: mutated, researchOnly: true });

  assert.equal(second.ablation.selectedFormVariant, first.ablation.selectedFormVariant);
  assert.deepEqual(
    second.models.map((row) => row.calibration.selectedTemperature),
    first.models.map((row) => row.calibration.selectedTemperature),
  );
  assert.notEqual(second.models[0].calibratedHoldout.logLoss, first.models[0].calibratedHoldout.logLoss);
});

test("evidence results are deterministic and unverified data blocks every model", () => {
  const observations = makeObservations(180, { overconfident: true });
  const first = runEvidenceAnalysis({ observations, researchOnly: true });
  const second = runEvidenceAnalysis({ observations: [...observations].reverse(), researchOnly: true });

  assert.deepEqual(second, first);
  assert.equal(first.status, "blocked");
  assert.ok(first.models.every((row) => row.status === "blocked"));
  assert.ok(first.models.every((row) => Number.isFinite(row.logLossVsUniform.lower95)));
});

test("probability metrics expose uncertainty and reliability bins", () => {
  const observations = makeObservations(100);
  const metrics = evaluateProbabilityMetrics(
    observations,
    (observation) => observation.forecasts["poisson-baseline"],
  );

  assert.equal(metrics.sampleCount, 100);
  assert.ok(metrics.accuracyLower95 < metrics.accuracy);
  assert.ok(metrics.accuracyUpper95 > metrics.accuracy);
  assert.ok(metrics.reliability.length > 0);
});

function makeObservations(count, options = {}) {
  const start = Date.parse("2023-01-01T18:00:00.000Z");
  return Array.from({ length: count }, (_, index) => {
    const kickoff = start + index * 24 * 3_600_000;
    const outcomeRoll = index % 20;
    const actualOutcome = outcomeRoll < 12 ? "1" : outcomeRoll < 17 ? "X" : "2";
    const raw = options.overconfident
      ? { home: 0.84, draw: 0.1, away: 0.06 }
      : { home: 0.58, draw: 0.25, away: 0.17 };
    const calibratedReference = { home: 0.6, draw: 0.25, away: 0.15 };
    const h2h = options.perfectH2h
      ? actualOutcome === "1" ? { home: 0.88, draw: 0.07, away: 0.05 }
        : actualOutcome === "X" ? { home: 0.08, draw: 0.84, away: 0.08 }
          : { home: 0.05, draw: 0.07, away: 0.88 }
      : raw;
    const variants = Object.fromEntries(FORM_ABLATION_CODES.map((code) => [code, {
      probabilities: code.startsWith("h2h-") ? h2h : raw,
      adjustedFormDifference: 12,
      h2hContribution: code.startsWith("h2h-") ? 3 : 0,
    }]));
    return {
      fixtureId: `evidence-${String(index + 1).padStart(4, "0")}`,
      predictionAt: new Date(kickoff - 48 * 3_600_000).toISOString(),
      kickoffAt: new Date(kickoff).toISOString(),
      resultKnownAt: new Date(kickoff + 3 * 3_600_000).toISOString(),
      actualOutcome,
      dataCompleteness: 1,
      forecasts: Object.fromEntries(EVIDENCE_MODEL_CODES.map((code, modelIndex) => [
        code,
        modelIndex === 2 && !options.overconfident ? calibratedReference : raw,
      ])),
      ablations: {
        ablationSchemaVersion: ABLATION_SCHEMA_VERSION,
        variants,
      },
    };
  });
}

function maxKey(probabilities) {
  return Object.entries(probabilities).sort((first, second) => second[1] - first[1])[0][0];
}
