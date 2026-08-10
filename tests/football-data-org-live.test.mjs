import assert from "node:assert/strict";
import test from "node:test";
import {
  FOOTBALL_DATA_ORG_ADAPTER_VERSION,
  FOOTBALL_DATA_ORG_FREE_COMPETITIONS,
  buildFootballDataOrgMatchesUrl,
  buildFootballDataOrgWindowUrls,
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
      id: 303,
      utcDate: "2026-08-10T19:15:00Z",
      status: "TIMED",
      competition: { code: "PPL" },
      season: { startDate: "2026-08-01" },
      homeTeam: { name: "CD Santa Clara", shortName: "Santa Clara" },
      awayTeam: { name: "CD Nacional", shortName: "Nacional" },
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
  assert.equal(FOOTBALL_DATA_ORG_ADAPTER_VERSION, "football-data-org-v4-matches-v2");
  assert.equal(FOOTBALL_DATA_ORG_FREE_COMPETITIONS.length, 12);
  assert.match(upstreamUrl, /PPL/);
  assert.match(upstreamUrl, /dateFrom=2026-08-10/);
  assert.match(upstreamUrl, /dateTo=2026-08-13/);
  assert.equal(result.envelopes.length, 3);
  assert.equal(result.pilotRowCount, 3);
  assert.equal(result.oddsSnapshotCount, 0);
  assert.ok(result.envelopes.every((item) => item.source.legalStatus === "review"));
  assert.ok(result.qualityIssues.some((item) => item.code === "ODDS_UNAVAILABLE"));
});

test("football-data.org rolling history respects the ten-day API period limit", () => {
  const urls = buildFootballDataOrgWindowUrls("2026-08-10T12:00:00.000Z");
  assert.equal(urls.length, 5);
  for (const value of urls) {
    const url = new URL(value);
    const from = Date.parse(`${url.searchParams.get("dateFrom")}T00:00:00Z`);
    const to = Date.parse(`${url.searchParams.get("dateTo")}T00:00:00Z`);
    assert.ok((to - from) / 86_400_000 <= 10);
    assert.match(url.searchParams.get("competitions"), /PPL/);
  }
});
