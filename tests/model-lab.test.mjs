import assert from "node:assert/strict";
import test from "node:test";
import {
  ModelLabValidationError,
  auditPointInTimeSamples,
  buildFormAdvantageFeatures,
  calculateKellyFraction,
  createSyntheticBacktestSamples,
  createWalkForwardFolds,
  defaultFormModelConfig,
  evaluateReleaseDecision,
  runBacktest,
} from "../lib/model-lab.ts";

const predictionAt = "2026-08-01T12:00:00.000Z";

test("strong recent form and dominance favour the home team", () => {
  const features = buildFormAdvantageFeatures({
    predictionAt,
    homeTeamId: "form-team",
    awayTeamId: "cold-team",
    homeHistory: history("home", "strong"),
    awayHistory: history("away", "weak"),
  });

  assert.ok(features.home.score > 75);
  assert.ok(features.away.score < 30);
  assert.ok(features.adjustedFormDifference > 40);
  assert.ok(features.probabilities.home > features.probabilities.away);
  assert.ok(features.probabilities.home > 0.7);
});

test("H2H is disabled by default and cannot exceed the 12 percent cap", () => {
  const input = {
    predictionAt,
    homeTeamId: "form-team",
    awayTeamId: "cold-team",
    homeHistory: history("home", "strong"),
    awayHistory: history("away", "weak"),
    h2hFromHomePerspective: history("home", "weak"),
  };

  const withoutH2h = buildFormAdvantageFeatures(input);
  assert.equal(defaultFormModelConfig.h2hWeight, 0);
  assert.equal(withoutH2h.h2hContribution, 0);
  assert.equal(withoutH2h.adjustedFormDifference, withoutH2h.rawFormDifference);

  const capped = buildFormAdvantageFeatures({ ...input, config: { h2hWeight: 0.12 } });
  assert.ok(Math.abs(capped.h2hContribution) <= 12);
  assert.throws(
    () => buildFormAdvantageFeatures({ ...input, config: { h2hWeight: 0.12001 } }),
    ModelLabValidationError,
  );
});

test("historical observations at or after prediction time are rejected", () => {
  const contaminated = history("home", "strong");
  contaminated[0].kickoffAt = predictionAt;

  assert.throws(
    () => buildFormAdvantageFeatures({
      predictionAt,
      homeTeamId: "home",
      awayTeamId: "away",
      homeHistory: contaminated,
      awayHistory: history("away", "weak"),
    }),
    (error) => error instanceof ModelLabValidationError
      && error.violations.some((issue) => issue.code === "FEATURE_AFTER_PREDICTION"),
  );
});

test("a started but unfinished historical match cannot become a feature", () => {
  const contaminated = history("home", "strong");
  contaminated[0] = {
    ...contaminated[0],
    kickoffAt: new Date(Date.parse(predictionAt) - 60 * 60_000).toISOString(),
    resultKnownAt: new Date(Date.parse(predictionAt) + 60 * 60_000).toISOString(),
  };

  assert.throws(
    () => buildFormAdvantageFeatures({
      predictionAt,
      homeTeamId: "home",
      awayTeamId: "away",
      homeHistory: contaminated,
      awayHistory: history("away", "weak"),
    }),
    (error) => error instanceof ModelLabValidationError
      && error.violations.some((issue) => issue.code === "FEATURE_AFTER_PREDICTION"),
  );
});

test("point-in-time audit detects future features and future odds", () => {
  const [sample] = createSyntheticBacktestSamples(20);
  const future = {
    ...sample,
    featureCutoffAt: new Date(Date.parse(sample.predictionAt) + 60_000).toISOString(),
    odds: {
      ...sample.odds,
      capturedAt: new Date(Date.parse(sample.predictionAt) + 60_000).toISOString(),
    },
  };
  const issues = auditPointInTimeSamples([future]);

  assert.ok(issues.some((issue) => issue.code === "FEATURE_AFTER_PREDICTION"));
  assert.ok(issues.some((issue) => issue.code === "ODDS_AFTER_PREDICTION"));
});

test("walk-forward folds preserve chronological train-test order and embargo", () => {
  const samples = createSyntheticBacktestSamples(120);
  const folds = createWalkForwardFolds(samples, {
    minTrainSize: 40,
    testSize: 20,
    stepSize: 20,
    embargoHours: 6,
  });

  assert.ok(folds.length >= 3);
  for (const fold of folds) {
    assert.ok(Date.parse(fold.trainStartAt) <= Date.parse(fold.trainEndAt));
    assert.ok(Date.parse(fold.trainEndAt) < Date.parse(fold.testStartAt));
    assert.ok(Date.parse(fold.testStartAt) <= Date.parse(fold.testEndAt));
    assert.equal(fold.testFixtureIds.length, fold.testCount);
  }
});

test("quarter Kelly rejects negative edge and obeys the two-percent system cap", () => {
  assert.equal(calculateKellyFraction(0.4, 2), 0);
  assert.equal(calculateKellyFraction(0.6, 2), 0.02);
  assert.equal(calculateKellyFraction(0.55, 2, 0.25, 0.015), 0.015);
});

test("low-completeness matches are scored but never recommended", () => {
  const samples = createSyntheticBacktestSamples(100);
  samples[70] = {
    ...samples[70],
    probabilities: { home: 0.8, draw: 0.1, away: 0.1 },
    odds: {
      home: 2,
      draw: 4,
      away: 5,
      capturedAt: samples[70].odds.capturedAt,
      closingHome: 1.8,
      closingDraw: 4.2,
      closingAway: 5.2,
    },
    dataCompleteness: 0.6,
  };

  const result = runBacktest(samples, { datasetKind: "historical" });
  const evaluated = result.predictions.find((row) => row.fixtureId === samples[70].fixtureId);
  assert.ok(evaluated);
  assert.equal(evaluated.predictedOutcome, "1");
  assert.equal(evaluated.selectedOutcome, null);
});

test("synthetic QA computes finite metrics but remains research-only", () => {
  const result = runBacktest(createSyntheticBacktestSamples(180), { datasetKind: "synthetic" });

  assert.equal(result.sourceSampleCount, 180);
  assert.equal(result.metrics.sampleCount, 120);
  assert.equal(result.predictions[0].fixtureId, "synthetic-0061");
  assert.ok(result.metrics.foldCount >= 3);
  assert.ok(Number.isFinite(result.metrics.logLoss));
  assert.ok(Number.isFinite(result.metrics.brierScore));
  assert.equal(result.releaseDecision.stage, "research");
  assert.equal(result.releaseDecision.automatedRecommendationAllowed, false);
});

test("even exceptional historical metrics stop at limited release", () => {
  const baseline = runBacktest(createSyntheticBacktestSamples(500), { datasetKind: "synthetic" }).metrics;
  const decision = evaluateReleaseDecision({
    ...baseline,
    sampleCount: 1_000,
    foldCount: 8,
    dataCompleteness: 1,
    logLoss: baseline.benchmarkLogLoss - 0.08,
    brierScore: baseline.benchmarkBrierScore - 0.04,
    ece: 0.02,
    consistentPeriods: 6,
    maxDrawdownUnits: 2,
  }, "historical", 0);

  assert.equal(decision.stage, "limited_recommendation");
  assert.notEqual(decision.stage, "general_recommendation");
});

test("unverified historical data remains research-only even when metrics are exceptional", () => {
  const baseline = runBacktest(createSyntheticBacktestSamples(500), { datasetKind: "synthetic" }).metrics;
  const decision = evaluateReleaseDecision({
    ...baseline,
    sampleCount: 1_000,
    foldCount: 8,
    dataCompleteness: 1,
    logLoss: baseline.benchmarkLogLoss - 0.08,
    brierScore: baseline.benchmarkBrierScore - 0.04,
    ece: 0.02,
    consistentPeriods: 6,
    maxDrawdownUnits: 2,
  }, "historical", 0, true);

  assert.equal(decision.stage, "research");
  assert.equal(decision.automatedRecommendationAllowed, false);
  assert.ok(decision.reasons.some((reason) => reason.includes("revizyon zamanı")));
});

test("result availability cannot precede kickoff", () => {
  const samples = createSyntheticBacktestSamples(100);
  samples[0] = {
    ...samples[0],
    resultKnownAt: new Date(Date.parse(samples[0].kickoffAt) - 1).toISOString(),
  };

  assert.throws(
    () => runBacktest(samples),
    (error) => error instanceof ModelLabValidationError
      && error.violations.some((issue) => issue.code === "INVALID_RESULT_TIMESTAMP"),
  );
});

test("runtime sample validation rejects invalid labels and completeness", () => {
  const samples = createSyntheticBacktestSamples(100);
  samples[0] = { ...samples[0], actualOutcome: "home", dataCompleteness: 1.4 };

  assert.throws(
    () => runBacktest(samples),
    (error) => error instanceof ModelLabValidationError
      && error.violations.some((issue) => issue.code === "INVALID_OUTCOME")
      && error.violations.some((issue) => issue.code === "INVALID_DATA_COMPLETENESS"),
  );
});

test("a contaminated backtest is rejected before metric calculation", () => {
  const samples = createSyntheticBacktestSamples(80);
  samples[12] = {
    ...samples[12],
    featureCutoffAt: new Date(Date.parse(samples[12].predictionAt) + 1).toISOString(),
  };

  assert.throws(
    () => runBacktest(samples),
    (error) => error instanceof ModelLabValidationError
      && error.violations.some((issue) => issue.code === "FEATURE_AFTER_PREDICTION"),
  );
});

function history(venue, strength) {
  return Array.from({ length: 10 }, (_, index) => {
    const strong = strength === "strong";
    const kickoff = Date.parse(predictionAt) - (index + 1) * 7 * 24 * 3_600_000;
    return {
      fixtureId: `${strength}-${venue}-${index + 1}`,
      kickoffAt: new Date(kickoff).toISOString(),
      venue: index % 3 === 0 ? (venue === "home" ? "away" : "home") : venue,
      result: strong ? (index === 7 ? "draw" : "win") : (index === 7 ? "draw" : "loss"),
      goalsFor: strong ? 2 + (index % 2) : index % 4 === 0 ? 1 : 0,
      goalsAgainst: strong ? (index % 4 === 0 ? 1 : 0) : 2 + (index % 2),
      opponentStrength: 0.58,
      expectedGoalsFor: strong ? 2.15 : 0.63,
      expectedGoalsAgainst: strong ? 0.7 : 2.05,
      shotsFor: strong ? 17 : 7,
      shotsAgainst: strong ? 7 : 16,
      shotsOnTargetFor: strong ? 7 : 2,
      shotsOnTargetAgainst: strong ? 2 : 7,
      possessionFor: strong ? 61 : 39,
      possessionAgainst: strong ? 39 : 61,
      dangerousAttacksFor: strong ? 55 : 24,
      dangerousAttacksAgainst: strong ? 24 : 54,
      penaltyAreaEntriesFor: strong ? 32 : 13,
      penaltyAreaEntriesAgainst: strong ? 13 : 31,
      ppdaFor: strong ? 8.4 : 15.1,
      ppdaAgainst: strong ? 15.1 : 8.4,
      bigChancesCreated: strong ? 4 : 1,
      bigChancesAllowed: strong ? 1 : 4,
    };
  });
}
