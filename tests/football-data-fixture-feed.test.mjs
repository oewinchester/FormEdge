import assert from "node:assert/strict";
import test from "node:test";
import {
  FOOTBALL_DATA_FIXTURE_FEED_ADAPTER_VERSION,
  FOOTBALL_DATA_FIXTURE_FEED_URL,
  parseFootballDataFixtureFeed,
} from "../lib/football-data-fixture-feed.ts";
import { parseFootballDataCsv } from "../lib/football-data-source.ts";

const fixturesCsv = `Div,Date,Time,HomeTeam,AwayTeam,Referee,B365H,B365D,B365A,BFDH,BFDD,BFDA,BMGMH,BMGMD,BMGMA
S0,08/08/2026,14:00,Hearts,Celtic,A Ref,4.20,3.60,1.80,,,,,,
T1,08/08/2026,19:30,Gaziantep,Galatasaray,B Ref,6.25,5.00,1.33,6.10,4.90,1.35,6.00,4.80,1.36
E0,09/08/2026,17:00,Arsenal,Liverpool,C Ref,2.20,3.50,3.10,2.18,3.45,3.05,3.00,,`;

test("the public fixture feed becomes allowlisted scheduled fixtures with research odds snapshots", () => {
  const parsed = parseFootballDataFixtureFeed({
    csv: fixturesCsv,
    capturedAt: "2026-08-04T08:17:00.000Z",
  });

  assert.equal(FOOTBALL_DATA_FIXTURE_FEED_ADAPTER_VERSION, "football-data-fixtures-v1");
  assert.equal(FOOTBALL_DATA_FIXTURE_FEED_URL, "https://www.football-data.co.uk/fixtures.csv");
  assert.equal(parsed.sourceRowCount, 3);
  assert.equal(parsed.pilotRowCount, 2);
  assert.equal(parsed.envelopes.length, 2);
  assert.equal(parsed.envelopes.flatMap((item) => item.payload.fixtures).length, 2);
  assert.equal(parsed.envelopes.flatMap((item) => item.payload.odds).length, 15);
  assert.equal(parsed.ignoredIncompleteOddsTriples, 1);
  assert.ok(parsed.envelopes.every((item) => item.payload.fixtures.every((fixture) => fixture.status === "scheduled")));
  assert.ok(parsed.qualityIssues.some((item) => item.code === "MARKET_CAPTURE_TIME_UNVERIFIED"));
});

test("fixture and completed-result imports share the same deterministic live-season fixture id", () => {
  const feed = parseFootballDataFixtureFeed({
    csv: fixturesCsv,
    capturedAt: "2026-08-04T08:17:00.000Z",
  });
  const result = parseFootballDataCsv({
    csv: `Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG,FTR,HS,AS,HST,AST\nT1,08/08/2026,19:30,Gaziantep,Galatasaray,0,3,A,5,15,2,5`,
    leagueCode: "T1",
    seasonCode: "2627",
    capturedAt: "2026-08-09T00:17:00.000Z",
  });
  const scheduled = feed.envelopes.find((item) => item.payload.league.id === "tr-super-lig")
    ?.payload.fixtures[0];

  assert.equal(scheduled?.id, result.envelope.payload.fixtures[0].id);
  assert.equal(result.envelope.payload.fixtures[0].status, "finished");
});

test("non-pilot rows can exist without fabricating a pilot envelope", () => {
  const parsed = parseFootballDataFixtureFeed({
    csv: `Div,Date,Time,HomeTeam,AwayTeam,B365H,B365D,B365A\nS0,08/08/2026,14:00,Hearts,Celtic,4.20,3.60,1.80`,
    capturedAt: "2026-08-04T08:17:00.000Z",
  });
  assert.equal(parsed.sourceRowCount, 1);
  assert.equal(parsed.pilotRowCount, 0);
  assert.deepEqual(parsed.envelopes, []);
});
