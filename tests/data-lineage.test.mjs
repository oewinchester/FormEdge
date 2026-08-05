import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPredictionLineageManifest,
  canonicalLineageJson,
  inspectPredictionLineage,
  parsePredictionLineageManifest,
} from "../lib/data-lineage.ts";

const baseInput = {
  predictionVersionId: "version-01",
  threadId: "thread-01",
  fixtureId: "fixture-target",
  predictionAt: "2026-08-05T12:00:00.000Z",
  featureCutoffAt: "2026-08-05T10:00:00.000Z",
  featureFingerprint: "feature-sha-01",
  modelCode: "form-dominance-baseline",
  modelVersionId: "model-version-01",
  normalized: {
    targetFixtureId: "fixture-target",
    homeHistoryFixtureIds: ["fixture-home-02", "fixture-home-01"],
    awayHistoryFixtureIds: ["fixture-away-01"],
    h2hFixtureIds: ["fixture-home-01"],
    benchmarkHistoryFingerprint: "benchmark-sha-01",
    selectedOddsSnapshotIds: ["odds-02", "odds-01"],
    lineupSnapshotIds: ["lineup-02", "lineup-01"],
    contextSnapshotId: "context-01",
  },
  sourceReferences: [
    { purpose: "fixture_context", entityType: "fixture_context_snapshot", entityId: "context-01", ingestionRunId: "run-01" },
    { purpose: "lineup", entityType: "lineup_snapshot", entityId: "lineup-02", ingestionRunId: "run-01" },
    { purpose: "lineup", entityType: "lineup_snapshot", entityId: "lineup-01", ingestionRunId: "run-01" },
    { purpose: "market_odds", entityType: "odds_snapshot", entityId: "odds-02", ingestionRunId: "run-01" },
    { purpose: "market_odds", entityType: "odds_snapshot", entityId: "odds-01", ingestionRunId: "run-01" },
    { purpose: "benchmark_fixture", entityType: "fixture", entityId: "fixture-home-02", ingestionRunId: "run-01" },
    { purpose: "benchmark_fixture", entityType: "fixture", entityId: "fixture-home-01", ingestionRunId: "run-01" },
    { purpose: "benchmark_fixture", entityType: "fixture", entityId: "fixture-away-01", ingestionRunId: "run-01" },
    { purpose: "target_fixture", entityType: "fixture", entityId: "fixture-target", ingestionRunId: "run-01" },
  ],
};

test("lineage manifests are deterministic, immutable and never recommendation eligible", async () => {
  const first = await buildPredictionLineageManifest(baseInput);
  const second = await buildPredictionLineageManifest({
    ...baseInput,
    normalized: {
      ...baseInput.normalized,
      homeHistoryFixtureIds: [...baseInput.normalized.homeHistoryFixtureIds].reverse(),
      selectedOddsSnapshotIds: [...baseInput.normalized.selectedOddsSnapshotIds].reverse(),
    },
    sourceReferences: [...baseInput.sourceReferences].reverse(),
  });
  assert.equal(canonicalLineageJson(first.manifest), canonicalLineageJson(second.manifest));
  assert.equal(first.checksumSha256, second.checksumSha256);
  assert.deepEqual(first.manifest.blockerCodes, []);
  assert.equal(first.manifest.researchOnly, true);
  assert.equal(first.manifest.recommendationEligible, false);
  baseInput.normalized.homeHistoryFixtureIds.push("fixture-mutated-after-build");
  assert.equal(first.manifest.normalized.homeHistoryFixtureIds.includes("fixture-mutated-after-build"), false);
  baseInput.normalized.homeHistoryFixtureIds.pop();
});

test("missing source run and model links produce the exact fail-closed blockers", async () => {
  const result = await buildPredictionLineageManifest({
    ...baseInput,
    modelVersionId: null,
    normalized: {
      ...baseInput.normalized,
      homeHistoryFixtureIds: [],
      awayHistoryFixtureIds: [],
      h2hFixtureIds: [],
      selectedOddsSnapshotIds: [],
      lineupSnapshotIds: [],
      contextSnapshotId: null,
    },
    sourceReferences: [
      { purpose: "target_fixture", entityType: "fixture", entityId: "fixture-target", ingestionRunId: null },
    ],
  });
  assert.deepEqual(result.manifest.blockerCodes, [
    "MODEL_VERSION_MISSING",
    "SOURCE_RUN_LINK_MISSING",
    "TARGET_FIXTURE_SOURCE_MISSING",
  ]);
});

test("runtime inspection blocks missing raw objects, late capture, license and model evidence", async () => {
  const { manifest } = await buildPredictionLineageManifest(baseInput);
  const graph = inspectPredictionLineage({
    manifest,
    runs: [{
      id: "run-01",
      sourceName: "Test source",
      legalStatus: "review",
      status: "completed",
      capturedAt: "2026-08-05T12:01:00.000Z",
      snapshotKey: "raw/test.json",
      checksumSha256: "raw-sha-01",
      rawObjectExists: false,
    }],
    model: null,
    publish: {
      threadId: "thread-01",
      threadStatus: "watchlist",
      versionNumber: 1,
      eventCount: 1,
      researchOnly: true,
      recommendationEligible: false,
    },
  });
  assert.equal(graph.status, "blocked");
  assert.deepEqual(graph.blockerCodes, [
    "MODEL_RECORD_MISSING",
    "RAW_SNAPSHOT_MISSING",
    "SOURCE_CAPTURE_AFTER_PREDICTION",
    "SOURCE_LICENSE_UNAPPROVED",
  ]);
  assert.equal(graph.policy.rawPayloadExposed, false);
  assert.equal(graph.policy.recommendationEligible, false);
});

test("legacy prediction versions without a lineage record remain explicitly blocked", () => {
  assert.equal(parsePredictionLineageManifest(JSON.stringify({
    schemaVersion: "prediction-lineage-v1",
    predictionVersionId: "corrupt-version",
    threadId: "corrupt-thread",
    normalized: {},
    sourceReferences: [{}],
    blockerCodes: [],
    researchOnly: true,
    recommendationEligible: false,
  })), null);
  const graph = inspectPredictionLineage({
    manifest: null,
    runs: [],
    model: null,
    publish: {
      threadId: "legacy-thread",
      threadStatus: "final",
      versionNumber: 1,
      eventCount: 2,
      researchOnly: true,
      recommendationEligible: false,
    },
  });
  assert.equal(graph.status, "blocked");
  assert.deepEqual(graph.blockerCodes, ["LINEAGE_MANIFEST_MISSING"]);
  assert.equal(graph.policy.missingLinksFailClosed, true);
  assert.equal(graph.policy.recommendationEligible, false);
});
