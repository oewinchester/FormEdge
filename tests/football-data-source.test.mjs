import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFootballDataSourceUrl,
  FootballDataSourceError,
  parseFootballDataCsv,
  resolveFootballDataSelection,
} from "../lib/football-data-source.ts";

const sample = `Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG,FTR,HS,AS,HST,AST,B365H,B365D,B365A,AvgCH,AvgCD,AvgCA
T1,08/08/2025,19:30,Gaziantep,Galatasaray,0,3,A,5,15,2,5,6.25,5,1.33,6.61,4.71,1.40
T1,09/08/2025,17:00,Samsunspor,Genclerbirligi,2,1,H,9,8,3,1,1.67,3.7,3.9,1.69,3.69,4.61
T1,09/08/2025,,Antalyaspor,Kasimpasa,2,1,H,16,10,6,2,2.5,3.4,2.4,2.54,3.29,2.62`;

test("pilot source URLs are built only from a fixed league and season allowlist", () => {
  assert.equal(
    buildFootballDataSourceUrl("T1", "2526"),
    "https://www.football-data.co.uk/mmz4281/2526/T1.csv",
  );
  assert.equal(resolveFootballDataSelection("E0", "2425").league.name, "Premier League");
  assert.throws(() => buildFootballDataSourceUrl("../../private", "2526"), FootballDataSourceError);
  assert.throws(() => buildFootballDataSourceUrl("T1", "2099"), FootballDataSourceError);
});

test("Football-Data CSV becomes deterministic research-only results and shot evidence", () => {
  const first = parseFootballDataCsv({
    csv: sample,
    leagueCode: "T1",
    seasonCode: "2526",
    capturedAt: "2026-08-04T00:00:00.000Z",
  });
  const second = parseFootballDataCsv({
    csv: sample,
    leagueCode: "T1",
    seasonCode: "2526",
    capturedAt: "2026-08-04T00:00:00.000Z",
  });
  assert.deepEqual(first.envelope.payload, second.envelope.payload);
  assert.equal(first.sourceRowCount, 3);
  assert.equal(first.importedStatRowCount, 6);
  assert.equal(first.envelope.payload.fixtures[0].status, "finished");
  assert.equal(first.envelope.payload.stats[0].expectedGoals, null);
  assert.equal(first.envelope.payload.odds.length, 0);
  assert.equal(first.missingKickoffTimeCount, 1);
  assert.ok(first.ignoredOddsColumnCount >= 6);
  assert.ok(first.qualityIssues.some((item) => item.code === "SOURCE_REVISION_TIME_UNVERIFIED"));
  assert.ok(first.qualityIssues.some((item) => item.code === "MARKET_CAPTURE_TIME_UNAVAILABLE"));
});

test("source result labels must agree with full-time scores", () => {
  const invalid = sample.replace("Gaziantep,Galatasaray,0,3,A", "Gaziantep,Galatasaray,0,3,H");
  assert.throws(
    () => parseFootballDataCsv({
      csv: invalid,
      leagueCode: "T1",
      seasonCode: "2526",
      capturedAt: "2026-08-04T00:00:00.000Z",
    }),
    (error) => error instanceof FootballDataSourceError
      && error.issues.some((item) => item.code === "RESULT_MISMATCH"),
  );
});

test("a CSV cannot impersonate another allowlisted division", () => {
  assert.throws(
    () => parseFootballDataCsv({
      csv: sample,
      leagueCode: "E0",
      seasonCode: "2526",
      capturedAt: "2026-08-04T00:00:00.000Z",
    }),
    (error) => error instanceof FootballDataSourceError
      && error.issues.some((item) => item.code === "DIVISION_MISMATCH"),
  );
});
