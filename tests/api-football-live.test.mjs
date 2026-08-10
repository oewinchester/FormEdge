import assert from "node:assert/strict";
import test from "node:test";
import {
  API_FOOTBALL_ADAPTER_VERSION,
  buildApiFootballWindowUrls,
  parseApiFootballFixtures,
} from "../lib/api-football-live.ts";

const payload = JSON.stringify({
  errors: [],
  response: [
    {
      fixture: { id: 9001, date: "2026-08-10T19:15:00+00:00", status: { short: "NS" } },
      league: { id: 94, name: "Primeira Liga", country: "Portugal", season: 2026 },
      teams: { home: { name: "Santa Clara" }, away: { name: "Nacional" } },
      goals: { home: null, away: null },
    },
    {
      fixture: { id: 9002, date: "2026-08-10T20:00:00+00:00", status: { short: "FT" } },
      league: { id: 203, name: "Süper Lig", country: "Turkey", season: 2026 },
      teams: { home: { name: "Galatasaray" }, away: { name: "Fenerbahçe" } },
      goals: { home: 2, away: 1 },
    },
  ],
});

test("API-Football fixtures become deterministic research-only envelopes", () => {
  const urls = buildApiFootballWindowUrls("2026-08-10T12:00:00.000Z");
  const result = parseApiFootballFixtures({ json: payload, capturedAt: "2026-08-10T12:00:00.000Z", upstreamUrl: urls[1] });
  assert.equal(API_FOOTBALL_ADAPTER_VERSION, "api-football-v3-fixtures-v1");
  assert.equal(urls.length, 2);
  assert.match(urls[1], /from=2026-08-10/);
  assert.match(urls[1], /to=2026-08-13/);
  assert.equal(result.envelopes.length, 2);
  assert.equal(result.pilotRowCount, 2);
  assert.ok(result.envelopes.every((item) => item.source.legalStatus === "review"));
  assert.equal(result.envelopes.find((item) => item.payload.league.id === "tr-super-lig")?.payload.fixtures[0].homeScore, 2);
});

test("API-Football provider errors fail closed", () => {
  assert.throws(() => parseApiFootballFixtures({
    json: JSON.stringify({ errors: { token: "invalid" }, response: [] }),
    capturedAt: "2026-08-10T12:00:00.000Z",
    upstreamUrl: "https://v3.football.api-sports.io/fixtures",
  }), /provider errors/);
});
