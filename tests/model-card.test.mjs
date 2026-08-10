import assert from "node:assert/strict";
import test from "node:test";
import { buildModelVersionCard, canonicalModelCardJson, parseModelVersionCardManifest } from "../lib/model-card.ts";

const checksum = "a".repeat(64);
const evidenceChecksum = "b".repeat(64);

test("a complete model card is deterministic, documented, and cannot open release", async () => {
  const input = completeInput();
  const first = await buildModelVersionCard(input);
  const second = await buildModelVersionCard(structuredClone(input));
  assert.equal(first.evidenceFingerprintSha256, second.evidenceFingerprintSha256);
  assert.equal(first.manifest.cardStatus, "documented");
  assert.deepEqual(first.manifest.blockerCodes, []);
  assert.equal(first.manifest.governance.automatedRecommendationAllowed, false);
  assert.equal(first.manifest.governance.cardCanOpenReleaseGate, false);
  assert.equal(first.manifest.governance.cardCanChangeModelStatus, false);
  assert.equal(first.manifest.governance.researchOnly, true);
  assert.equal(first.manifest.governance.recommendationEligible, false);
  assert.ok(first.manifest.warningCodes.includes("EVIDENCE_RESEARCH_ONLY"));
});

test("missing dataset, temporal evidence, backtest, and release gate fail closed", async () => {
  const input = completeInput();
  input.dataset = null;
  input.backtest = null;
  input.evidence = null;
  input.releaseGate = null;
  const { manifest } = await buildModelVersionCard(input);
  assert.equal(manifest.cardStatus, "blocked");
  assert.deepEqual(manifest.blockerCodes, ["BACKTEST_MISSING", "DATASET_MISSING", "RELEASE_GATE_RECORD_MISSING", "TEMPORAL_EVIDENCE_MISSING"]);
  assert.equal(manifest.governance.recommendationEligible, false);
});

test("checksum drift and leakage are explicit blockers", async () => {
  const input = completeInput();
  input.dataset.checksumSha256 = "c".repeat(64);
  input.dataset.leakageViolationCount = 2;
  input.backtest.leakageViolationCount = 1;
  const { manifest } = await buildModelVersionCard(input);
  assert.ok(manifest.blockerCodes.includes("DATASET_CHECKSUM_MISMATCH"));
  assert.ok(manifest.blockerCodes.includes("EVIDENCE_DATASET_MISMATCH"));
  assert.ok(manifest.blockerCodes.includes("DATASET_LEAKAGE_DETECTED"));
  assert.ok(manifest.blockerCodes.includes("BACKTEST_LEAKAGE_DETECTED"));
});

test("manifest parser rejects a card that claims release authority", async () => {
  const { manifest } = await buildModelVersionCard(completeInput());
  assert.ok(parseModelVersionCardManifest(canonicalModelCardJson(manifest)));
  const unsafe = structuredClone(manifest);
  unsafe.governance.cardCanOpenReleaseGate = true;
  assert.equal(parseModelVersionCardManifest(JSON.stringify(unsafe)), null);
});

function completeInput() {
  return {
    evidenceAsOf: "2026-08-10T09:00:00.000Z",
    model: { id: "model-1", code: "form-dominance-baseline", displayName: "Form & Dominance Baseline", family: "heuristic", targetMarket: "1X2", status: "research", description: "Point-in-time form baseline." },
    version: { id: "version-1", versionLabel: "1.1.0-test", featureSchemaVersion: "form-feature-v1", configChecksumSha256: checksum, trainingCutoffAt: "2026-06-30T23:59:59.000Z", status: "candidate", createdAt: "2026-08-01T00:00:00.000Z" },
    dataset: { id: "dataset-1", name: "Pilot league PIT", status: "completed", checksumSha256: checksum, featureSchemaVersion: "form-feature-v1", eligibleSampleCount: 640, averageDataCompleteness: 0.96, leakageViolationCount: 0, completedAt: "2026-08-02T00:00:00.000Z" },
    backtest: { id: "backtest-1", status: "completed", datasetKind: "historical", datasetChecksumSha256: checksum, featureDatasetRunId: "dataset-1", leagueLabel: "Pilot League", market: "1X2", evaluationMode: "walk_forward", sourceSampleCount: 640, sampleCount: 500, foldCount: 6, leakageViolationCount: 0, dataCompleteness: 0.96, accuracy: 0.51, logLoss: 0.97, brierScore: 0.2, ece: 0.04, releaseStage: "research", completedAt: "2026-08-03T00:00:00.000Z" },
    evidence: { id: "evidence-1", status: "completed", schemaVersion: "temporal-holdout-calibration-v1", configChecksumSha256: evidenceChecksum, datasetChecksumSha256: checksum, researchOnly: true, evidenceStatus: "blocked", developmentCount: 360, calibrationCount: 120, holdoutCount: 120, holdoutStartAt: "2026-03-01T00:00:00.000Z", holdoutEndAt: "2026-06-30T00:00:00.000Z", model: { modelCode: "form-dominance-baseline", status: "blocked", calibration: { selectedTemperature: 1.08, accepted: true, calibrationRawLogLoss: 1.01, calibrationFittedLogLoss: 0.99, calibrationGain: 0.02 }, calibratedHoldout: { sampleCount: 120, accuracy: 0.52, logLoss: 0.96, brierScore: 0.19, ece: 0.035 }, logLossVsUniform: { delta: -0.13, lower95: -0.18, upper95: -0.08 } }, completedAt: "2026-08-04T00:00:00.000Z" },
    releaseGate: { id: "gate-1", stage: "research", activeModelVersionId: "version-1", lastBacktestRunId: "backtest-1", automatedRecommendationAllowed: false, evidenceSummary: ["Research-only source assurance."], decidedAt: "2026-08-05T00:00:00.000Z" },
  };
}
