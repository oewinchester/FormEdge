import assert from "node:assert/strict";
import test from "node:test";
import {
  CsvAdapterError,
  parseFootballCsv,
  sampleFootballCsv,
} from "../lib/csv-adapter.ts";
import { evaluatePayloadQuality } from "../lib/data-quality.ts";

test("CSV adapter normalizes the controlled football export", () => {
  const parsed = parseFootballCsv(sampleFootballCsv);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.league.name, "Süper Lig");
  assert.equal(parsed.rows[0].home.name, "Atlas İstanbul");
  assert.equal(parsed.rows[0].homeStats.expectedGoals, 2.14);
  assert.deepEqual(parsed.rows[0].odds, {
    bookmaker: "Example International",
    home: 1.72,
    draw: 3.6,
    away: 5.1,
  });
});

test("CSV adapter reports missing required columns", () => {
  assert.throws(
    () => parseFootballCsv("fixture_id,home_team_name\nfx-1,Atlas"),
    (error) => error instanceof CsvAdapterError
      && error.issues.some((issue) => issue.code === "MISSING_COLUMN"),
  );
});

test("complete and consistent advanced data opens the recommendation gate", () => {
  const payload = completePayload();
  const report = evaluatePayloadQuality(payload, { capturedAt: new Date().toISOString() });
  assert.equal(report.grade, "A");
  assert.equal(report.qualityScore, 100);
  assert.equal(report.recommendationEligible, true);
  assert.equal(report.errorCount, 0);
});

test("impossible shot totals close the recommendation gate", () => {
  const payload = completePayload();
  payload.stats[0].shotsOnTarget = 18;
  const report = evaluatePayloadQuality(payload, { capturedAt: new Date().toISOString() });
  assert.equal(report.recommendationEligible, false);
  assert.ok(report.issues.some((issue) => issue.code === "SHOTS_ON_TARGET_GT_SHOTS"));
});

function completePayload() {
  return {
    league: { id: "league-tr", countryCode: "TR", name: "Süper Lig", tier: 1, coverageLevel: "advanced" },
    season: "2026-27",
    teams: [
      { id: "atlas", name: "Atlas İstanbul", shortName: "ATL", countryCode: "TR" },
      { id: "kuzey", name: "Kuzey 1967", shortName: "KZY", countryCode: "TR" },
    ],
    fixtures: [{
      id: "fixture-1",
      kickoffAt: "2026-08-02T18:00:00.000Z",
      homeTeamId: "atlas",
      awayTeamId: "kuzey",
      status: "finished",
      homeScore: 2,
      awayScore: 0,
    }],
    stats: [
      { fixtureId: "fixture-1", teamId: "atlas", possession: 61, shots: 17, shotsOnTarget: 7, expectedGoals: 2.14, dangerousAttacks: 54, penaltyAreaEntries: 31, ppda: 8.7, bigChancesAllowed: 1 },
      { fixtureId: "fixture-1", teamId: "kuzey", possession: 39, shots: 7, shotsOnTarget: 2, expectedGoals: 0.62, dangerousAttacks: 24, penaltyAreaEntries: 13, ppda: 14.2, bigChancesAllowed: 4 },
    ],
    odds: [
      { id: "odd-1", fixtureId: "fixture-1", bookmaker: "Example", market: "1X2", selection: "1", line: null, decimalOdds: 1.72, capturedAt: new Date().toISOString() },
      { id: "odd-x", fixtureId: "fixture-1", bookmaker: "Example", market: "1X2", selection: "X", line: null, decimalOdds: 3.6, capturedAt: new Date().toISOString() },
      { id: "odd-2", fixtureId: "fixture-1", bookmaker: "Example", market: "1X2", selection: "2", line: null, decimalOdds: 5.1, capturedAt: new Date().toISOString() },
    ],
    lineups: [],
  };
}
