import assert from "node:assert/strict";
import test from "node:test";
import {
  SPORTMONKS_ADAPTER_VERSION,
  SPORTMONKS_MAX_PAGES_PER_DATE,
  SPORTMONKS_PLAN_LEAGUES,
  SPORTMONKS_TEAM_HISTORY_DAYS,
  buildSportMonksAccountUrls,
  buildSportMonksDateUrls,
  buildSportMonksTeamHistoryUrl,
  mergeSportMonksRateLimits,
  parseSportMonksAccountCoverage,
  parseSportMonksFixtures,
  readSportMonksRateLimit,
  sportMonksAuthorizationHeader,
  sportMonksPageUrl,
  sportMonksPlanTeamIds,
  sportMonksTeamId,
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
      statistics: [
        { type_id: 45, participant_id: 3, data: { value: 58 } },
        { type_id: 42, participant_id: 3, data: { value: 14 } },
        { type_id: 86, participant_id: 3, data: { value: 7 } },
        { type_id: 44, participant_id: 3, data: { value: 61 } },
        { type_id: 45, participant_id: 4, data: { value: 42 } },
      ],
    },
  ],
});

test("SportMonks plan coverage is the exact 30-league subscription", () => {
  assert.equal(SPORTMONKS_ADAPTER_VERSION, "sportmonks-v3-fixtures-v9");
  assert.equal(SPORTMONKS_PLAN_LEAGUES.length, 30);
  assert.equal(new Set(SPORTMONKS_PLAN_LEAGUES.map((league) => league.sportmonksId)).size, 30);
  assert.deepEqual(
    SPORTMONKS_PLAN_LEAGUES.map((league) => league.sportmonksId).sort((a, b) => a - b),
    [8, 9, 72, 82, 85, 181, 208, 271, 301, 325, 384, 387, 444, 453, 462, 486, 501, 564, 567, 573, 591, 600, 609, 636, 648, 651, 743, 779, 944, 968],
  );
});

test("SportMonks account endpoints and licensed coverage are explicit", () => {
  assert.deepEqual(buildSportMonksAccountUrls(), {
    leagues: "https://api.sportmonks.com/v3/my/leagues",
    resources: "https://api.sportmonks.com/v3/my/resources",
    enrichments: "https://api.sportmonks.com/v3/my/enrichments",
  });
  const coverage = parseSportMonksAccountCoverage({
    leagues: { data: SPORTMONKS_PLAN_LEAGUES.map((league) => ({ id: league.sportmonksId })) },
    resources: { data: [{ name: "Fixture statistics" }, { name: "Lineups" }] },
    enrichments: { data: [{ name: "Expected Goals xG" }] },
    checkedAt: "2026-08-13T09:00:00.000Z",
  });
  assert.equal(coverage.status, "verified");
  assert.equal(coverage.licensedLeagueIds.length, 30);
  assert.deepEqual(coverage.missingLeagueIds, []);
  assert.equal(coverage.features.statistics, "available");
  assert.equal(coverage.features.lineups, "available");
  assert.equal(coverage.features.xg, "available");
  assert.equal(coverage.features.odds, "unavailable");
});

test("SportMonks account and rate-limit evidence fails visibly instead of becoming false success", () => {
  const partial = parseSportMonksAccountCoverage({
    leagues: [{ league_id: 8 }, { league_id: 600 }],
    checkedAt: "2026-08-13T09:00:00.000Z",
    errors: ["resources:HTTP_403"],
  });
  assert.equal(partial.status, "partial");
  assert.equal(partial.missingLeagueIds.length, 28);
  assert.equal(partial.features.statistics, "unknown");
  const first = readSportMonksRateLimit(new Headers({ "x-ratelimit-limit": "3000", "x-ratelimit-remaining": "2870" }));
  const second = readSportMonksRateLimit(new Headers({ "ratelimit-limit": "3000", "ratelimit-remaining": "2862", "ratelimit-reset": "42" }));
  assert.deepEqual(mergeSportMonksRateLimits([first, second]), { limit: 3000, remaining: 2862, reset: "42", observedResponses: 2 });
});

test("SportMonks team history URL backfills one year with match statistics", () => {
  const url = buildSportMonksTeamHistoryUrl("2026-08-10T12:00:00.000Z", 1001);
  assert.match(url, /fixtures\/between\/2025-08-10\/2026-08-09\/1001/);
  assert.match(url, /include=participants%3Bscores%3Bstate%3Bstatistics/);
  assert.match(url, /order=desc/);
  assert.match(url, /per_page=50/);
  assert.doesNotMatch(url, /api_token/i);
  assert.equal(SPORTMONKS_TEAM_HISTORY_DAYS, 365);
  assert.throws(() => buildSportMonksTeamHistoryUrl("2026-08-10T12:00:00.000Z", 0), /team id/);
});

test("SportMonks daily URLs keep the token out of logs and enforce pagination", () => {
  const urls = buildSportMonksDateUrls("2026-08-10T12:00:00.000Z");
  assert.equal(urls.length, 4);
  assert.match(urls[0], /fixtures\/date\/2026-08-10/);
  assert.match(urls[3], /fixtures\/date\/2026-08-13/);
  const url = urls[0];
  assert.match(url, /filters=fixtureLeagues%3A/);
  assert.match(url, /include=participants%3Bscores%3Bstate/);
  assert.match(url, /order=asc/);
  assert.doesNotMatch(url, /order=starting_at/);
  assert.doesNotMatch(url, /timezone=/);
  assert.doesNotMatch(url, /api_token/i);
  assert.equal(SPORTMONKS_MAX_PAGES_PER_DATE, 8);
  assert.match(sportMonksPageUrl(url, 2), /page=2/);
  assert.deepEqual(sportMonksPlanTeamIds(JSON.parse(payload).data), [1, 2, 3, 4]);
});

test("SportMonks uses the documented raw Authorization token without Bearer prefix", () => {
  assert.equal(sportMonksAuthorizationHeader("  secret-token  "), "secret-token");
  assert.throws(() => sportMonksAuthorizationHeader("   "), /token is required/);
});

test("SportMonks fixtures become deterministic research-only envelopes", () => {
  const upstreamUrl = buildSportMonksDateUrls("2026-08-10T12:00:00.000Z")[0];
  const result = parseSportMonksFixtures({ json: payload, capturedAt: "2026-08-10T12:00:00.000Z", upstreamUrl });
  assert.equal(result.envelopes.length, 2);
  assert.equal(result.pilotRowCount, 2);
  assert.ok(result.envelopes.every((item) => item.source.legalStatus === "review"));
  const premierLeague = result.envelopes.find((item) => item.payload.league.id === "eng-premier-league");
  assert.equal(premierLeague?.payload.fixtures[0].status, "finished");
  assert.equal(premierLeague?.payload.fixtures[0].homeTeamId, "sportmonks-team-3");
  assert.equal(premierLeague?.payload.fixtures[0].awayTeamId, "sportmonks-team-4");
  assert.equal(premierLeague?.payload.fixtures[0].homeScore, 2);
  assert.equal(premierLeague?.payload.fixtures[0].awayScore, 1);
  assert.equal(premierLeague?.payload.stats.length, 2);
  assert.equal(premierLeague?.payload.stats[0].possession, 58);
  assert.equal(premierLeague?.payload.stats[0].shots, 14);
  assert.equal(premierLeague?.payload.stats[0].shotsOnTarget, 7);
  assert.equal(premierLeague?.payload.stats[0].dangerousAttacks, 61);
  assert.equal(premierLeague?.payload.league.coverageLevel, "advanced");
  assert.equal(result.envelopes.find((item) => item.payload.league.id === "tr-super-lig")?.payload.fixtures[0].status, "scheduled");
});

test("SportMonks provider team identity stays stable when the display name changes", () => {
  assert.equal(sportMonksTeamId(1905), "sportmonks-team-1905");
  assert.throws(() => sportMonksTeamId(0), /team id/);
  const renamed = JSON.parse(payload);
  renamed.data[0].participants[0].name = "Galatasaray SK";
  const result = parseSportMonksFixtures({
    json: JSON.stringify(renamed),
    capturedAt: "2026-08-10T12:00:00.000Z",
    upstreamUrl: buildSportMonksDateUrls("2026-08-10T12:00:00.000Z")[0],
  });
  const fixture = result.envelopes.find((item) => item.payload.league.id === "tr-super-lig")?.payload.fixtures[0];
  assert.equal(fixture?.homeTeamId, "sportmonks-team-1");
});

test("SportMonks invalid envelopes fail closed", () => {
  assert.throws(() => parseSportMonksFixtures({
    json: JSON.stringify({ message: "Unauthenticated" }),
    capturedAt: "2026-08-10T12:00:00.000Z",
    upstreamUrl: "https://api.sportmonks.com/v3/football/fixtures",
  }), /data array/);
});
