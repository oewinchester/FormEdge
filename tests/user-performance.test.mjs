import assert from "node:assert/strict";
import test from "node:test";
import {
  actualOutcomeForFixture,
  settlementStatusFor,
  summarizePerformance,
} from "../lib/user-performance.ts";

test("finished fixtures settle to 1-X-2 while unfinished fixtures remain pending", () => {
  assert.equal(actualOutcomeForFixture({ status: "finished", homeScore: 3, awayScore: 1 }), "1");
  assert.equal(actualOutcomeForFixture({ status: "finished", homeScore: 2, awayScore: 2 }), "X");
  assert.equal(actualOutcomeForFixture({ status: "finished", homeScore: 0, awayScore: 1 }), "2");
  assert.equal(actualOutcomeForFixture({ status: "scheduled", homeScore: null, awayScore: null }), null);
  assert.equal(actualOutcomeForFixture({ status: "live", homeScore: 1, awayScore: 0 }), null);
  assert.equal(actualOutcomeForFixture({ status: "cancelled", homeScore: null, awayScore: null }), "void");
  assert.throws(
    () => actualOutcomeForFixture({ status: "finished", homeScore: null, awayScore: 1 }),
    /valid non-negative integer scores/i,
  );
});

test("only a withdrawal recorded before kickoff removes a publication from win-loss truth", () => {
  assert.equal(settlementStatusFor({ predictedOutcome: "1", actualOutcome: "1", withdrawnBeforeKickoff: false }), "won");
  assert.equal(settlementStatusFor({ predictedOutcome: "1", actualOutcome: "2", withdrawnBeforeKickoff: false }), "lost");
  assert.equal(settlementStatusFor({ predictedOutcome: "1", actualOutcome: "void", withdrawnBeforeKickoff: false }), "void");
  assert.equal(settlementStatusFor({ predictedOutcome: "1", actualOutcome: "1", withdrawnBeforeKickoff: true }), "withdrawn");
});

test("performance summaries are deterministic by league, market and month", () => {
  const summary = summarizePerformance([
    { settlementStatus: "won", leagueLabel: "Süper Lig", market: "1X2", settledAt: "2026-08-01T12:00:00.000Z" },
    { settlementStatus: "lost", leagueLabel: "Süper Lig", market: "1X2", settledAt: "2026-08-02T12:00:00.000Z" },
    { settlementStatus: "withdrawn", leagueLabel: "Premier League", market: "1X2", settledAt: "2026-08-03T12:00:00.000Z" },
    { settlementStatus: "void", leagueLabel: "Premier League", market: "1X2", settledAt: "2026-07-30T12:00:00.000Z" },
  ]);

  assert.deepEqual(summary.counts, { published: 4, won: 1, lost: 1, void: 1, withdrawn: 1 });
  assert.equal(summary.decided, 2);
  assert.equal(summary.hitRate, 0.5);
  assert.deepEqual(summary.byMonth.map((row) => [row.key, row.published]), [["2026-08", 3], ["2026-07", 1]]);
  assert.deepEqual(summary.byLeague.map((row) => [row.key, row.published, row.hitRate]), [
    ["Premier League", 2, null],
    ["Süper Lig", 2, 0.5],
  ]);
});
