import assert from "node:assert/strict";
import test from "node:test";
import { BENCHMARK_SCHEMA_VERSION } from "../lib/benchmark-models.ts";
import { buildPointInTimeDataset } from "../lib/point-in-time-dataset.ts";

const config = {
  leagueId: "league-pilot",
  predictionHorizonHours: 48,
  minimumHistoryMatches: 5,
  resultAvailabilityHours: 4,
};

test("D1-shaped history produces audited point-in-time samples", async () => {
  const input = researchHistory();
  const result = await buildPointInTimeDataset({ ...input, config });

  assert.ok(result.samples.length >= 60);
  assert.equal(result.audit.leakageViolationCount, 0);
  assert.equal(result.audit.eligibleSampleCount, result.samples.length);
  assert.equal(result.audit.rejectedSampleCount + result.samples.length, result.audit.finishedFixtureCount);
  assert.match(result.datasetChecksumSha256, /^[a-f0-9]{64}$/);
  assert.equal(result.benchmarkSchemaVersion, BENCHMARK_SCHEMA_VERSION);

  for (const record of result.records) {
    const predictionMs = Date.parse(record.sample.predictionAt);
    assert.ok(Date.parse(record.sample.featureCutoffAt) <= predictionMs);
    assert.ok(Date.parse(record.sample.odds.capturedAt) <= predictionMs);
    assert.ok(Date.parse(record.featurePayload.provenance.closingOddsCapturedAt) < Date.parse(record.sample.kickoffAt));
    assert.ok(Date.parse(record.featurePayload.provenance.benchmarkHistoryCutoffAt) <= predictionMs);
    assert.equal(record.featurePayload.benchmarks.benchmarkSchemaVersion, BENCHMARK_SCHEMA_VERSION);
    const benchmarkTotal = Object.values(record.featurePayload.benchmarks.dixonColes.probabilities)
      .reduce((sum, value) => sum + value, 0);
    assert.ok(Math.abs(benchmarkTotal - 1) < 1e-7);
    const histories = [
      ...record.featurePayload.provenance.homeHistoryFixtureIds,
      ...record.featurePayload.provenance.awayHistoryFixtureIds,
      ...record.featurePayload.provenance.h2hFixtureIds,
    ];
    assert.ok(!histories.includes(record.sample.fixtureId));
  }
});

test("dataset checksum and feature fingerprints do not depend on input row order", async () => {
  const input = researchHistory();
  const first = await buildPointInTimeDataset({ ...input, config });
  const reversed = await buildPointInTimeDataset({
    fixtures: [...input.fixtures].reverse(),
    stats: [...input.stats].reverse(),
    odds: [...input.odds].reverse(),
    config,
  });

  assert.equal(first.datasetChecksumSha256, reversed.datasetChecksumSha256);
  assert.deepEqual(
    first.samples.map((sample) => [sample.fixtureId, sample.featureFingerprint]),
    reversed.samples.map((sample) => [sample.fixtureId, sample.featureFingerprint]),
  );
});

test("changing a later result cannot rewrite an earlier frozen feature vector", async () => {
  const input = researchHistory();
  const first = await buildPointInTimeDataset({ ...input, config });
  const early = first.records[Math.floor(first.records.length / 3)];
  const laterFixture = [...input.fixtures]
    .reverse()
    .find((fixture) => Date.parse(fixture.kickoffAt) > Date.parse(early.sample.kickoffAt));
  assert.ok(laterFixture);

  const changed = structuredClone(input);
  const target = changed.fixtures.find((fixture) => fixture.id === laterFixture.id);
  target.homeScore = target.homeScore === 5 ? 0 : 5;
  target.awayScore = target.awayScore === 4 ? 0 : 4;
  const rebuilt = await buildPointInTimeDataset({ ...changed, config });
  const frozen = rebuilt.records.find((record) => record.sample.fixtureId === early.sample.fixtureId);

  assert.ok(frozen);
  assert.equal(frozen.sample.featureFingerprint, early.sample.featureFingerprint);
  assert.deepEqual(frozen.sample.probabilities, early.sample.probabilities);
});

test("future odds are excluded from the prediction snapshot while pre-kickoff odds remain closing evidence", async () => {
  const result = await buildPointInTimeDataset({ ...researchHistory(), config });
  const record = result.records[0];
  const kickoffMs = Date.parse(record.sample.kickoffAt);

  assert.equal(record.featurePayload.provenance.oddsBookmaker, "A Book");
  assert.equal(Date.parse(record.sample.odds.capturedAt), kickoffMs - 72 * 3_600_000);
  assert.equal(Date.parse(record.featurePayload.provenance.closingOddsCapturedAt), kickoffMs - 1 * 3_600_000);
  assert.equal(record.sample.odds.closingHome, 1.66);
});

test("basic history remains analyzable but stays below the advanced-data recommendation threshold", async () => {
  const input = researchHistory();
  const result = await buildPointInTimeDataset({ ...input, stats: [], config });

  assert.ok(result.samples.length > 0);
  assert.ok(result.audit.averageDataCompleteness < 0.85);
  assert.ok(result.samples.every((sample) => sample.dataCompleteness < 0.85));
});

test("insufficient team history is rejected rather than backfilled from the future", async () => {
  const input = researchHistory(16);
  const result = await buildPointInTimeDataset({
    ...input,
    config: { ...config, minimumHistoryMatches: 10 },
  });

  assert.equal(result.samples.length, 0);
  assert.equal(result.audit.rejectedSampleCount, result.audit.finishedFixtureCount);
  assert.ok(
    result.audit.rejectionCounts.INSUFFICIENT_HOME_HISTORY
      + result.audit.rejectionCounts.INSUFFICIENT_AWAY_HISTORY > 0,
  );
});

function researchHistory(fixtureCount = 128) {
  const teams = Array.from({ length: 8 }, (_, index) => `team-${index + 1}`);
  const fixtures = [];
  const stats = [];
  const odds = [];
  const startMs = Date.parse("2024-01-01T18:00:00.000Z");

  for (let index = 0; index < fixtureCount; index += 1) {
    const homeTeamId = teams[index % teams.length];
    const awayTeamId = teams[(index * 3 + 1) % teams.length];
    const kickoffMs = startMs + index * 24 * 3_600_000;
    const fixtureId = `pilot-${String(index + 1).padStart(4, "0")}`;
    const homeScore = (index * 5 + 2) % 4;
    const awayScore = (index * 7 + 1) % 3;
    fixtures.push({
      id: fixtureId,
      leagueId: "league-pilot",
      season: index < 64 ? "2023-24" : "2024-25",
      kickoffAt: new Date(kickoffMs).toISOString(),
      homeTeamId,
      awayTeamId,
      status: "finished",
      homeScore,
      awayScore,
    });

    stats.push(
      stat(fixtureId, homeTeamId, true, index),
      stat(fixtureId, awayTeamId, false, index),
    );
    addOddsGroup(odds, fixtureId, "A Book", kickoffMs - 72 * 3_600_000, 1.92, 3.45, 4.1, "open");
    addOddsGroup(odds, fixtureId, "Z Book", kickoffMs - 72 * 3_600_000, 1.91, 3.5, 4.2, "tie");
    addOddsGroup(odds, fixtureId, "A Book", kickoffMs - 24 * 3_600_000, 1.78, 3.6, 4.5, "after-prediction");
    addOddsGroup(odds, fixtureId, "A Book", kickoffMs - 1 * 3_600_000, 1.66, 3.75, 4.9, "closing");
    addOddsGroup(odds, fixtureId, "A Book", kickoffMs + 1 * 3_600_000, 1.4, 4.2, 6.1, "post-kickoff");
  }

  return { fixtures, stats, odds };
}

function stat(fixtureId, teamId, home, index) {
  const positive = home ? 1 : -1;
  return {
    fixtureId,
    teamId,
    possession: 50 + positive * (6 + index % 4),
    shots: home ? 14 + index % 5 : 9 + index % 4,
    shotsOnTarget: home ? 5 + index % 3 : 3 + index % 2,
    expectedGoals: home ? 1.62 + (index % 4) * 0.11 : 0.94 + (index % 3) * 0.1,
    dangerousAttacks: home ? 47 + index % 8 : 33 + index % 7,
    penaltyAreaEntries: home ? 27 + index % 6 : 18 + index % 5,
    ppda: home ? 9.1 + (index % 3) * 0.2 : 12.8 + (index % 4) * 0.2,
    bigChancesAllowed: home ? 1 + index % 2 : 2 + index % 3,
  };
}

function addOddsGroup(target, fixtureId, bookmaker, capturedMs, home, draw, away, suffix) {
  for (const [selection, decimalOdds] of [["1", home], ["X", draw], ["2", away]]) {
    target.push({
      id: `${fixtureId}-${bookmaker}-${suffix}-${selection}`,
      fixtureId,
      bookmaker,
      market: "1X2",
      selection,
      decimalOdds,
      capturedAt: new Date(capturedMs).toISOString(),
    });
  }
}
