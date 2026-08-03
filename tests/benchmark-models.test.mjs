import assert from "node:assert/strict";
import test from "node:test";
import {
  BENCHMARK_SCHEMA_VERSION,
  buildBenchmarkForecast,
  scoreMatrixProbabilities,
} from "../lib/benchmark-models.ts";
import { ModelLabValidationError } from "../lib/model-lab.ts";

test("Poisson and Dixon-Coles score matrices are normalized and react at low scores", () => {
  const poisson = scoreMatrixProbabilities(1.42, 1.08, 0, 12);
  const dixonColes = scoreMatrixProbabilities(1.42, 1.08, -0.06, 12);

  assert.ok(Math.abs(poisson.home + poisson.draw + poisson.away - 1) < 1e-6);
  assert.ok(Math.abs(dixonColes.home + dixonColes.draw + dixonColes.away - 1) < 1e-6);
  assert.ok(dixonColes.draw > poisson.draw);
  assert.ok(dixonColes.home < poisson.home);
  assert.ok(dixonColes.away < poisson.away);
});

test("all benchmark branches favour a repeatedly stronger home team", () => {
  const { history, target } = benchmarkHistory();
  const forecast = buildBenchmarkForecast({ history, target });

  assert.equal(forecast.benchmarkSchemaVersion, BENCHMARK_SCHEMA_VERSION);
  assert.ok(forecast.elo.homeRating > forecast.elo.awayRating);
  assert.ok(forecast.elo.probabilities.home > forecast.elo.probabilities.away);
  assert.ok(forecast.poisson.expectedHomeGoals > forecast.poisson.expectedAwayGoals);
  assert.ok(forecast.poisson.probabilities.home > forecast.poisson.probabilities.away);
  assert.ok(forecast.dixonColes.probabilities.home > forecast.dixonColes.probabilities.away);
});

test("benchmark output is deterministic under reversed source order", () => {
  const { history, target } = benchmarkHistory();
  const first = buildBenchmarkForecast({ history, target });
  const second = buildBenchmarkForecast({ history: [...history].reverse(), target });

  assert.deepEqual(first, second);
});

test("benchmark history cannot contain a result learned after prediction time", () => {
  const { history, target } = benchmarkHistory();
  history[0] = {
    ...history[0],
    resultKnownAt: new Date(Date.parse(target.predictionAt) + 1).toISOString(),
  };

  assert.throws(
    () => buildBenchmarkForecast({ history, target }),
    (error) => error instanceof ModelLabValidationError
      && error.message.includes("not available"),
  );
});

test("benchmark history cannot include the target fixture", () => {
  const { history, target } = benchmarkHistory();
  history[0] = { ...history[0], fixtureId: target.fixtureId };

  assert.throws(
    () => buildBenchmarkForecast({ history, target }),
    (error) => error instanceof ModelLabValidationError
      && error.message.includes("target fixture"),
  );
});

function benchmarkHistory() {
  const teams = Array.from({ length: 8 }, (_, index) => `team-${index + 1}`);
  const strength = new Map(teams.map((team, index) => [team, teams.length - index]));
  const startMs = Date.parse("2023-08-01T18:00:00.000Z");
  const history = Array.from({ length: 160 }, (_, index) => {
    const homeTeamId = teams[index % teams.length];
    const awayTeamId = teams[(index * 3 + 1) % teams.length];
    const homeStrength = strength.get(homeTeamId);
    const awayStrength = strength.get(awayTeamId);
    const homeScore = clamp(Math.round(1.3 + (homeStrength - awayStrength) * 0.32 + (index % 3) * 0.18), 0, 5);
    const awayScore = clamp(Math.round(1 + (awayStrength - homeStrength) * 0.27 + (index % 2) * 0.16), 0, 5);
    const kickoffMs = startMs + index * 30 * 3_600_000;
    return {
      fixtureId: `history-${String(index + 1).padStart(4, "0")}`,
      kickoffAt: new Date(kickoffMs).toISOString(),
      resultKnownAt: new Date(kickoffMs + 4 * 3_600_000).toISOString(),
      homeTeamId,
      awayTeamId,
      homeScore,
      awayScore,
    };
  });
  const lastKnownMs = Date.parse(history.at(-1).resultKnownAt);
  const predictionMs = lastKnownMs + 24 * 3_600_000;
  return {
    history,
    target: {
      fixtureId: "target-0001",
      predictionAt: new Date(predictionMs).toISOString(),
      kickoffAt: new Date(predictionMs + 48 * 3_600_000).toISOString(),
      homeTeamId: "team-1",
      awayTeamId: "team-8",
    },
  };
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}
