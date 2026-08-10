import assert from "node:assert/strict";
import test from "node:test";
import {
  FOOTBALL_DATA_ORG_ADAPTER_VERSION,
  buildFootballDataOrgMatchesUrl,
  parseFootballDataOrgMatches,
} from "../lib/football-data-org-live.ts";

const payload = JSON.stringify({
  matches: [
    {
      id: 101,
      utcDate: "2026-08-10T18:00:00Z",
      status: "SCHEDULED",
      competition: { code: "PL" },
      season: { startDate: "2026-08-08" },
      homeTeam: { name: "Arsenal", shortName: "Arsenal" },
      awayTeam: { name: "Liverpool", shortName: "Liverpool" },
      score: { fullTime: { home: null, away: null } },
    },
    {
      id: 202,
      utcDate: "2026-08-10T19:00:00Z",
      status: "IN_PLAY",
      competition: { code: "PD" },
      season: { startDate: "2026-08-01" },
      homeTeam: { name: "Barcelona" },
      awayTeam: { name: "Valencia" },
      score: { fullTime: { home: 1, away: 0 } },
    },
  ],
});

test("football-data.org live fixtures become basic research envelopes", () => {
  const upstreamUrl = buildFootballDataOrgMatchesUrl("2026-08-10T12:00:00.000Z");
  const result = parseFootballDataOrgMatches({
    json: payload,
    capturedAt: "2026-08-10T12:00:00.000Z",
    upstreamUrl,
  });
  assert.equal(FOOTBALL_DATA_ORG_ADAPTER_VERSION, "football-data-org-v4-matches-v1");
  assert.match(upstreamUrl, /dateFrom=2026-08-10/);
  assert.match(upstreamUrl, /dateTo=2026-08-13/);
  assert.equal(result.envelopes.length, 2);
  assert.equal(result.pilotRowCount, 2);
  assert.equal(result.oddsSnapshotCount, 0);
  assert.ok(result.envelopes.every((item) => item.source.legalStatus === "review"));
  assert.ok(result.qualityIssues.some((item) => item.code === "ODDS_UNAVAILABLE"));
});
