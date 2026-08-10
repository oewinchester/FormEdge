import assert from "node:assert/strict";
import test from "node:test";
import {
  SPORTMONKS_ADAPTER_VERSION,
  SPORTMONKS_MAX_PAGES_PER_CYCLE,
  SPORTMONKS_PLAN_LEAGUES,
  buildSportMonksWindowUrl,
  parseSportMonksFixtures,
  sportMonksPageUrl,
} from "../lib/sportmonks-live.ts";

const payload = JSON.stringify({
  data: [
    {
      id: 19001,
      league_id: 600,
      season_id: 25501,
      state_id: 1,
      starting_at: "2026-08-10 19:00:00",
      state: { developer_name: "NS" },
      participants: [
        { id: 1, name: "Galatasaray", short_code: "GAL", meta: { location: "home" } },
        { id: 2, name: "Fenerbahçe", short_code: "FEN", meta: { location: "away" } },
      ],
      scores: [],
    },
    {
      id: 19002,
      league_id: 8,
      season_id: 25583,
      state_id: 5,
      starting_at: "2026-08-09 14:00:00",
      state: { developer_name: "FT" },
      participants: [
        { id: 3, name: "Arsenal", short_code: "ARS", meta: { location: "home" } },
        { id: 4, name: "Chelsea", short_code: "CHE", meta: { location: "away" } },
      ],
      scores: [
        { description: "CURRENT", score: { goals: 2, participant: "home" } },
        { description: "CURRENT", score: { goals: 1, participant: "away" } },
      ],
    },
  ],
});

test("SportMonks plan coverage is the exact 30-league subscription", () => {
  assert.equal(SPORTMONKS_ADAPTER_VERSION, "sportmonks-v3-fixtures-v1");
  assert.equal(SPORTMONKS_PLAN_LEAGUES.length, 30);
  assert.equal(new Set(SPORTMONKS_PLAN_LEAGUES.map((league) => league.sportmonksId)).size, 30);
  assert.deepEqual(
    SPORTMONKS_PLAN_LEAGUES.map((league) => league.sportmonksId).sort((a, b) => a - b),
    [8, 9, 72, 82, 85, 181, 208, 271, 301, 325, 384, 387, 444, 453, 462, 486, 501, 564, 567, 573, 591, 600, 609, 636, 648, 651, 743, 779, 944, 968],
  );
});

test("SportMonks URL keeps the token out of logs and enforces the page budget", () => {
  const url = buildSportMonksWindowUrl("2026-08-10T12:00:00.000Z");
  assert.match(url, /fixtures\/between\/2026-08-09\/2026-08-13/);
  assert.match(url, /fixtureLeagues%3A8%2C9%2C72/);
  assert.match(url, /include=participants%3Bscores%3Bstate/);
  assert.doesNotMatch(url, /api_token/i);
  assert.equal(SPORTMONKS_MAX_PAGES_PER_CYCLE, 3);
  assert.match(sportMonksPageUrl(url, 2), /page=2/);
});

test("SportMonks fixtures become deterministic research-only envelopes", () => {
  const upstreamUrl = buildSportMonksWindowUrl("2026-08-10T12:00:00.000Z");
  const result = parseSportMonksFixtures({ json: payload, capturedAt: "2026-08-10T12:00:00.000Z", upstreamUrl });
  assert.equal(result.envelopes.length, 2);
  assert.equal(result.pilotRowCount, 2);
  assert.ok(result.envelopes.every((item) => item.source.legalStatus === "review"));
  const premierLeague = result.envelopes.find((item) => item.payload.league.id === "eng-premier-league");
  assert.equal(premierLeague?.payload.fixtures[0].status, "finished");
  assert.equal(premierLeague?.payload.fixtures[0].homeScore, 2);
  assert.equal(premierLeague?.payload.fixtures[0].awayScore, 1);
  assert.equal(result.envelopes.find((item) => item.payload.league.id === "tr-super-lig")?.payload.fixtures[0].status, "scheduled");
});

test("SportMonks invalid envelopes fail closed", () => {
  assert.throws(() => parseSportMonksFixtures({
    json: JSON.stringify({ message: "Unauthenticated" }),
    capturedAt: "2026-08-10T12:00:00.000Z",
    upstreamUrl: "https://api.sportmonks.com/v3/football/fixtures",
  }), /data array/);
});
