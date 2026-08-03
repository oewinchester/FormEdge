import assert from "node:assert/strict";
import test from "node:test";
import {
  VALUE_ENGINE_POLICY,
  evaluateValueOpportunity,
} from "../lib/value-engine.ts";

test("de-vig consensus is normalized and odds never rewrite model probabilities", () => {
  const model = { home: 0.61, draw: 0.24, away: 0.15 };
  const result = evaluateValueOpportunity(input({ modelProbabilities: model }));
  assert.deepEqual(result.modelProbabilities, model);
  assert.ok(result.fairMarketProbabilities);
  assert.ok(Math.abs(Object.values(result.fairMarketProbabilities).reduce((sum, value) => sum + value, 0) - 1) < 1e-7);
  assert.equal(result.predictedOutcome, "1");
  assert.equal(result.bestDecimalOdds, 1.82);
  assert.equal(result.bestBookmaker, "Book B");
});

test("a four-point edge and positive expected value opens the normal value tier", () => {
  const result = evaluateValueOpportunity(input());
  assert.equal(result.status, "value");
  assert.equal(result.recommendationEligible, true);
  assert.ok(result.edge >= VALUE_ENGINE_POLICY.minimumEdge);
  assert.ok(result.expectedValue >= VALUE_ENGINE_POLICY.minimumExpectedValue);
  assert.equal(result.bookmakerCount, 2);
});

test("odds from 1.20 through 1.29 can qualify only in the explicit low-odds tier", () => {
  const quotes = twoBooks({ first: [1.25, 7, 15], second: [1.26, 6.8, 14] });
  const result = evaluateValueOpportunity(input({
    modelProbabilities: { home: 0.86, draw: 0.09, away: 0.05 },
    quotes,
  }));
  assert.equal(result.status, "low_odds_value");
  assert.equal(result.recommendationEligible, true);
  assert.ok(result.flags.includes("LOW_ODDS_TIER"));
});

test("odds below 1.20 and weak edge never become betting recommendations", () => {
  const lowOdds = evaluateValueOpportunity(input({
    modelProbabilities: { home: 0.91, draw: 0.06, away: 0.03 },
    quotes: twoBooks({ first: [1.16, 9, 21], second: [1.18, 8.5, 20] }),
  }));
  assert.equal(lowOdds.status, "no_value");
  assert.equal(lowOdds.recommendationEligible, false);
  assert.ok(lowOdds.flags.includes("ODDS_BELOW_MINIMUM"));

  const weakEdge = evaluateValueOpportunity(input({ modelProbabilities: { home: 0.54, draw: 0.27, away: 0.19 } }));
  assert.equal(weakEdge.status, "no_value");
  assert.ok(weakEdge.flags.includes("EDGE_BELOW_MINIMUM"));
});

test("future quotes are excluded and stale or single-book markets stay analysis-only", () => {
  const future = quoteSet("Future Book", "2026-08-04T13:00:00.000Z", [2.2, 3.5, 3.6], "future");
  const unavailable = evaluateValueOpportunity(input({ quotes: future }));
  assert.equal(unavailable.status, "unavailable");

  const stale = evaluateValueOpportunity(input({
    quotes: [
      ...quoteSet("Book A", "2026-08-02T08:00:00.000Z", [1.8, 3.7, 5], "stale-a"),
      ...quoteSet("Book B", "2026-08-02T08:00:00.000Z", [1.82, 3.6, 4.9], "stale-b"),
    ],
  }));
  assert.equal(stale.status, "stale_market");

  const single = evaluateValueOpportunity(input({ quotes: quoteSet("Book A", "2026-08-04T11:00:00.000Z", [1.82, 3.8, 5.2], "single") }));
  assert.equal(single.status, "insufficient_market");
  assert.equal(single.recommendationEligible, false);
});

test("large cross-book dispersion or market movement pauses value publication", () => {
  const dispersion = evaluateValueOpportunity(input({
    quotes: [
      ...quoteSet("Book A", "2026-08-04T11:00:00.000Z", [1.45, 4.7, 8], "disp-a"),
      ...quoteSet("Book B", "2026-08-04T11:00:00.000Z", [2.25, 3.2, 3.2], "disp-b"),
    ],
  }));
  assert.equal(dispersion.status, "market_anomaly");
  assert.ok(dispersion.flags.includes("CROSS_BOOK_DISPERSION_HIGH"));

  const movement = evaluateValueOpportunity(input({
    quotes: [
      ...quoteSet("Book A", "2026-08-04T08:00:00.000Z", [1.3, 5, 11], "move-old-a"),
      ...quoteSet("Book A", "2026-08-04T11:00:00.000Z", [2, 3.5, 4], "move-new-a"),
      ...quoteSet("Book B", "2026-08-04T08:00:00.000Z", [1.32, 4.9, 10.5], "move-old-b"),
      ...quoteSet("Book B", "2026-08-04T11:00:00.000Z", [2.02, 3.45, 3.95], "move-new-b"),
    ],
  }));
  assert.equal(movement.status, "market_anomaly");
  assert.ok(movement.flags.includes("MATERIAL_MARKET_MOVE"));
});

function input(overrides = {}) {
  return {
    fixtureId: "fixture-1",
    asOf: "2026-08-04T12:00:00.000Z",
    kickoffAt: "2026-08-04T18:00:00.000Z",
    modelProbabilities: { home: 0.61, draw: 0.24, away: 0.15 },
    predictedOutcome: "1",
    quotes: twoBooks(),
    ...overrides,
  };
}

function twoBooks({ first = [1.78, 3.6, 4.8], second = [1.82, 3.5, 4.7] } = {}) {
  return [
    ...quoteSet("Book A", "2026-08-04T11:00:00.000Z", first, "a"),
    ...quoteSet("Book B", "2026-08-04T11:00:00.000Z", second, "b"),
  ];
}

function quoteSet(bookmaker, capturedAt, odds, prefix) {
  return ["1", "X", "2"].map((selection, index) => ({
    id: `${prefix}-${selection}`,
    bookmaker,
    market: "1X2",
    selection,
    decimalOdds: odds[index],
    capturedAt,
  }));
}
