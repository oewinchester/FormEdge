import type { ProbabilityTriple } from "./model-lab.ts";
import { ModelLabValidationError } from "./model-lab.ts";

export const BENCHMARK_SCHEMA_VERSION = "elo-poisson-dixon-coles-v1" as const;

export type BenchmarkFixture = {
  fixtureId: string;
  kickoffAt: string;
  resultKnownAt: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
};

export type BenchmarkTarget = {
  fixtureId: string;
  predictionAt: string;
  kickoffAt: string;
  homeTeamId: string;
  awayTeamId: string;
};

export type BenchmarkModelConfig = {
  eloInitialRating: number;
  eloKFactor: number;
  eloScale: number;
  eloHomeAdvantage: number;
  eloBaseDrawProbability: number;
  eloMinimumDrawProbability: number;
  eloDrawDecayScale: number;
  poissonHalfLifeDays: number;
  poissonPriorMatches: number;
  poissonIterations: number;
  minimumExpectedGoals: number;
  maximumExpectedGoals: number;
  maximumGoals: number;
  dixonColesRhoMinimum: number;
  dixonColesRhoMaximum: number;
  dixonColesRhoStep: number;
};

export type BenchmarkForecast = {
  benchmarkSchemaVersion: typeof BENCHMARK_SCHEMA_VERSION;
  historyFixtureCount: number;
  historyCutoffAt: string;
  elo: {
    probabilities: ProbabilityTriple;
    homeRating: number;
    awayRating: number;
    expectedHomeScore: number;
  };
  poisson: {
    probabilities: ProbabilityTriple;
    expectedHomeGoals: number;
    expectedAwayGoals: number;
  };
  dixonColes: {
    probabilities: ProbabilityTriple;
    expectedHomeGoals: number;
    expectedAwayGoals: number;
    rho: number;
  };
};

export const defaultBenchmarkModelConfig: BenchmarkModelConfig = {
  eloInitialRating: 1_500,
  eloKFactor: 20,
  eloScale: 400,
  eloHomeAdvantage: 65,
  eloBaseDrawProbability: 0.27,
  eloMinimumDrawProbability: 0.12,
  eloDrawDecayScale: 700,
  poissonHalfLifeDays: 180,
  poissonPriorMatches: 8,
  poissonIterations: 28,
  minimumExpectedGoals: 0.2,
  maximumExpectedGoals: 4.5,
  maximumGoals: 10,
  dixonColesRhoMinimum: -0.15,
  dixonColesRhoMaximum: 0.15,
  dixonColesRhoStep: 0.005,
};

type NormalizedFixture = BenchmarkFixture & {
  kickoffMs: number;
  resultKnownMs: number;
};

type WeightedFixture = NormalizedFixture & {
  weight: number;
};

type StrengthFit = {
  globalHomeGoals: number;
  globalAwayGoals: number;
  attack: Map<string, number>;
  defense: Map<string, number>;
};

export function buildBenchmarkForecast(input: {
  history: BenchmarkFixture[];
  target: BenchmarkTarget;
  config?: Partial<BenchmarkModelConfig>;
}): BenchmarkForecast {
  const config = normalizeConfig(input.config);
  const predictionMs = validTimestamp(input.target?.predictionAt, "target.predictionAt");
  const kickoffMs = validTimestamp(input.target?.kickoffAt, "target.kickoffAt");
  if (predictionMs >= kickoffMs) {
    throw new ModelLabValidationError("Benchmark predictionAt must be before kickoffAt.");
  }
  if (!input.target.homeTeamId || !input.target.awayTeamId || input.target.homeTeamId === input.target.awayTeamId) {
    throw new ModelLabValidationError("Benchmark target requires two different team ids.");
  }
  if (!Array.isArray(input.history) || input.history.length < 10 || input.history.length > 5_000) {
    throw new ModelLabValidationError("A benchmark forecast requires between 10 and 5,000 historical fixtures.");
  }

  const history = normalizeHistory(input.history, predictionMs, input.target.fixtureId);
  const elo = fitElo(history, input.target, config);
  const weighted = weightHistory(history, predictionMs, config.poissonHalfLifeDays);
  const strengths = fitPoissonStrengths(weighted, input.target, config);
  const expectedHomeGoals = clamp(
    strengths.globalHomeGoals
      * (strengths.attack.get(input.target.homeTeamId) ?? 1)
      * (strengths.defense.get(input.target.awayTeamId) ?? 1),
    config.minimumExpectedGoals,
    config.maximumExpectedGoals,
  );
  const expectedAwayGoals = clamp(
    strengths.globalAwayGoals
      * (strengths.attack.get(input.target.awayTeamId) ?? 1)
      * (strengths.defense.get(input.target.homeTeamId) ?? 1),
    config.minimumExpectedGoals,
    config.maximumExpectedGoals,
  );
  const rho = fitDixonColesRho(weighted, strengths, config);

  return {
    benchmarkSchemaVersion: BENCHMARK_SCHEMA_VERSION,
    historyFixtureCount: history.length,
    historyCutoffAt: new Date(Math.max(...history.map((fixture) => fixture.resultKnownMs))).toISOString(),
    elo,
    poisson: {
      probabilities: scoreMatrixProbabilities(expectedHomeGoals, expectedAwayGoals, 0, config.maximumGoals),
      expectedHomeGoals: round(expectedHomeGoals, 6),
      expectedAwayGoals: round(expectedAwayGoals, 6),
    },
    dixonColes: {
      probabilities: scoreMatrixProbabilities(expectedHomeGoals, expectedAwayGoals, rho, config.maximumGoals),
      expectedHomeGoals: round(expectedHomeGoals, 6),
      expectedAwayGoals: round(expectedAwayGoals, 6),
      rho: round(rho, 6),
    },
  };
}

function normalizeHistory(history: BenchmarkFixture[], predictionMs: number, targetFixtureId: string) {
  const seen = new Set<string>();
  return history.map((fixture) => {
    if (!fixture || typeof fixture.fixtureId !== "string" || !fixture.fixtureId || seen.has(fixture.fixtureId)) {
      throw new ModelLabValidationError("Benchmark history requires unique, non-empty fixture ids.");
    }
    if (fixture.fixtureId === targetFixtureId) {
      throw new ModelLabValidationError("The target fixture cannot appear in its own benchmark history.");
    }
    seen.add(fixture.fixtureId);
    const kickoffMs = validTimestamp(fixture.kickoffAt, `${fixture.fixtureId}.kickoffAt`);
    const resultKnownMs = validTimestamp(fixture.resultKnownAt, `${fixture.fixtureId}.resultKnownAt`);
    if (resultKnownMs < kickoffMs || resultKnownMs > predictionMs) {
      throw new ModelLabValidationError(`Fixture ${fixture.fixtureId} was not available at benchmark prediction time.`);
    }
    if (!fixture.homeTeamId || !fixture.awayTeamId || fixture.homeTeamId === fixture.awayTeamId
      || !validScore(fixture.homeScore) || !validScore(fixture.awayScore)) {
      throw new ModelLabValidationError(`Fixture ${fixture.fixtureId} has invalid teams or scores.`);
    }
    return {
      ...fixture,
      kickoffAt: new Date(kickoffMs).toISOString(),
      resultKnownAt: new Date(resultKnownMs).toISOString(),
      kickoffMs,
      resultKnownMs,
    };
  }).sort((first, second) => (
    first.resultKnownMs - second.resultKnownMs
    || first.kickoffMs - second.kickoffMs
    || first.fixtureId.localeCompare(second.fixtureId)
  ));
}

function fitElo(
  history: NormalizedFixture[],
  target: BenchmarkTarget,
  config: BenchmarkModelConfig,
) {
  const ratings = new Map<string, number>();
  const ratingFor = (teamId: string) => ratings.get(teamId) ?? config.eloInitialRating;

  for (const fixture of history) {
    const homeRating = ratingFor(fixture.homeTeamId);
    const awayRating = ratingFor(fixture.awayTeamId);
    const expectedHome = eloExpectedScore(
      homeRating + config.eloHomeAdvantage,
      awayRating,
      config.eloScale,
    );
    const actualHome = fixture.homeScore > fixture.awayScore
      ? 1
      : fixture.homeScore === fixture.awayScore ? 0.5 : 0;
    const change = config.eloKFactor * (actualHome - expectedHome);
    ratings.set(fixture.homeTeamId, homeRating + change);
    ratings.set(fixture.awayTeamId, awayRating - change);
  }

  const homeRating = ratingFor(target.homeTeamId);
  const awayRating = ratingFor(target.awayTeamId);
  const effectiveDifference = homeRating + config.eloHomeAdvantage - awayRating;
  const expectedHomeScore = eloExpectedScore(
    homeRating + config.eloHomeAdvantage,
    awayRating,
    config.eloScale,
  );
  const draw = clamp(
    config.eloBaseDrawProbability * Math.exp(-Math.abs(effectiveDifference) / config.eloDrawDecayScale),
    config.eloMinimumDrawProbability,
    config.eloBaseDrawProbability,
  );
  const probabilities = normalizeProbabilities({
    home: expectedHomeScore - draw / 2,
    draw,
    away: 1 - expectedHomeScore - draw / 2,
  });

  return {
    probabilities,
    homeRating: round(homeRating, 4),
    awayRating: round(awayRating, 4),
    expectedHomeScore: round(expectedHomeScore, 8),
  };
}

function fitPoissonStrengths(
  history: WeightedFixture[],
  target: BenchmarkTarget,
  config: BenchmarkModelConfig,
): StrengthFit {
  const teams = new Set<string>([target.homeTeamId, target.awayTeamId]);
  let totalWeight = 0;
  let weightedHomeGoals = 0;
  let weightedAwayGoals = 0;
  for (const fixture of history) {
    teams.add(fixture.homeTeamId);
    teams.add(fixture.awayTeamId);
    totalWeight += fixture.weight;
    weightedHomeGoals += fixture.weight * fixture.homeScore;
    weightedAwayGoals += fixture.weight * fixture.awayScore;
  }
  const priorWeight = config.poissonPriorMatches;
  const globalHomeGoals = (weightedHomeGoals + priorWeight * 1.45) / (totalWeight + priorWeight);
  const globalAwayGoals = (weightedAwayGoals + priorWeight * 1.15) / (totalWeight + priorWeight);
  let attack = new Map([...teams].map((teamId) => [teamId, 1]));
  let defense = new Map([...teams].map((teamId) => [teamId, 1]));
  const priorGoalExposure = priorWeight * ((globalHomeGoals + globalAwayGoals) / 2);

  for (let iteration = 0; iteration < config.poissonIterations; iteration += 1) {
    const nextAttack = new Map<string, number>();
    const nextDefense = new Map<string, number>();
    for (const teamId of teams) {
      let scored = priorGoalExposure;
      let scoredExpectation = priorGoalExposure;
      let conceded = priorGoalExposure;
      let concededExpectation = priorGoalExposure;

      for (const fixture of history) {
        if (fixture.homeTeamId === teamId) {
          scored += fixture.weight * fixture.homeScore;
          scoredExpectation += fixture.weight * globalHomeGoals * (defense.get(fixture.awayTeamId) ?? 1);
          conceded += fixture.weight * fixture.awayScore;
          concededExpectation += fixture.weight * globalAwayGoals * (attack.get(fixture.awayTeamId) ?? 1);
        } else if (fixture.awayTeamId === teamId) {
          scored += fixture.weight * fixture.awayScore;
          scoredExpectation += fixture.weight * globalAwayGoals * (defense.get(fixture.homeTeamId) ?? 1);
          conceded += fixture.weight * fixture.homeScore;
          concededExpectation += fixture.weight * globalHomeGoals * (attack.get(fixture.homeTeamId) ?? 1);
        }
      }

      const attackEstimate = clamp(scored / Math.max(scoredExpectation, 1e-9), 0.35, 2.8);
      const defenseEstimate = clamp(conceded / Math.max(concededExpectation, 1e-9), 0.35, 2.8);
      nextAttack.set(teamId, 0.45 * (attack.get(teamId) ?? 1) + 0.55 * attackEstimate);
      nextDefense.set(teamId, 0.45 * (defense.get(teamId) ?? 1) + 0.55 * defenseEstimate);
    }

    const attackGeometricMean = Math.exp(
      [...nextAttack.values()].reduce((sum, value) => sum + Math.log(value), 0) / nextAttack.size,
    );
    attack = new Map([...nextAttack].map(([teamId, value]) => [teamId, value / attackGeometricMean]));
    defense = new Map([...nextDefense].map(([teamId, value]) => [teamId, value * attackGeometricMean]));
  }

  return { globalHomeGoals, globalAwayGoals, attack, defense };
}

function fitDixonColesRho(
  history: WeightedFixture[],
  strengths: StrengthFit,
  config: BenchmarkModelConfig,
) {
  const steps = Math.round(
    (config.dixonColesRhoMaximum - config.dixonColesRhoMinimum) / config.dixonColesRhoStep,
  );
  let bestRho = 0;
  let bestLogLikelihood = Number.NEGATIVE_INFINITY;

  for (let index = 0; index <= steps; index += 1) {
    const rho = config.dixonColesRhoMinimum + index * config.dixonColesRhoStep;
    let logLikelihood = 0;
    let valid = true;
    for (const fixture of history) {
      const lambda = clamp(
        strengths.globalHomeGoals
          * (strengths.attack.get(fixture.homeTeamId) ?? 1)
          * (strengths.defense.get(fixture.awayTeamId) ?? 1),
        config.minimumExpectedGoals,
        config.maximumExpectedGoals,
      );
      const mu = clamp(
        strengths.globalAwayGoals
          * (strengths.attack.get(fixture.awayTeamId) ?? 1)
          * (strengths.defense.get(fixture.homeTeamId) ?? 1),
        config.minimumExpectedGoals,
        config.maximumExpectedGoals,
      );
      const correction = dixonColesTau(fixture.homeScore, fixture.awayScore, lambda, mu, rho);
      if (!(correction > 0)) {
        valid = false;
        break;
      }
      logLikelihood += fixture.weight * Math.log(correction);
    }
    if (valid && (
      logLikelihood > bestLogLikelihood + 1e-12
      || (Math.abs(logLikelihood - bestLogLikelihood) <= 1e-12 && Math.abs(rho) < Math.abs(bestRho))
    )) {
      bestLogLikelihood = logLikelihood;
      bestRho = rho;
    }
  }
  return bestRho;
}

export function scoreMatrixProbabilities(
  expectedHomeGoals: number,
  expectedAwayGoals: number,
  rho = 0,
  maximumGoals = 10,
): ProbabilityTriple {
  if (!(expectedHomeGoals > 0) || !(expectedAwayGoals > 0)
    || !Number.isInteger(maximumGoals) || maximumGoals < 5 || maximumGoals > 15) {
    throw new ModelLabValidationError("Score matrix inputs are invalid.");
  }
  const homeGoalProbabilities = poissonProbabilities(expectedHomeGoals, maximumGoals);
  const awayGoalProbabilities = poissonProbabilities(expectedAwayGoals, maximumGoals);
  let home = 0;
  let draw = 0;
  let away = 0;

  for (let homeGoals = 0; homeGoals <= maximumGoals; homeGoals += 1) {
    for (let awayGoals = 0; awayGoals <= maximumGoals; awayGoals += 1) {
      const correction = dixonColesTau(homeGoals, awayGoals, expectedHomeGoals, expectedAwayGoals, rho);
      const probability = homeGoalProbabilities[homeGoals] * awayGoalProbabilities[awayGoals] * correction;
      if (!(probability >= 0) || !Number.isFinite(probability)) {
        throw new ModelLabValidationError("Dixon-Coles correction produced an invalid score probability.");
      }
      if (homeGoals > awayGoals) home += probability;
      else if (homeGoals === awayGoals) draw += probability;
      else away += probability;
    }
  }
  return normalizeProbabilities({ home, draw, away });
}

export function dixonColesTau(
  homeGoals: number,
  awayGoals: number,
  expectedHomeGoals: number,
  expectedAwayGoals: number,
  rho: number,
) {
  if (homeGoals === 0 && awayGoals === 0) return 1 - expectedHomeGoals * expectedAwayGoals * rho;
  if (homeGoals === 1 && awayGoals === 0) return 1 + expectedAwayGoals * rho;
  if (homeGoals === 0 && awayGoals === 1) return 1 + expectedHomeGoals * rho;
  if (homeGoals === 1 && awayGoals === 1) return 1 - rho;
  return 1;
}

function weightHistory(history: NormalizedFixture[], predictionMs: number, halfLifeDays: number) {
  const denominator = halfLifeDays * 86_400_000;
  return history.map((fixture): WeightedFixture => ({
    ...fixture,
    weight: Math.exp((-Math.LN2 * Math.max(0, predictionMs - fixture.resultKnownMs)) / denominator),
  }));
}

function poissonProbabilities(lambda: number, maximumGoals: number) {
  const probabilities = [Math.exp(-lambda)];
  for (let goals = 1; goals <= maximumGoals; goals += 1) {
    probabilities.push(probabilities[goals - 1] * lambda / goals);
  }
  return probabilities;
}

function eloExpectedScore(homeRating: number, awayRating: number, scale: number) {
  return 1 / (1 + 10 ** ((awayRating - homeRating) / scale));
}

function normalizeProbabilities(probabilities: ProbabilityTriple): ProbabilityTriple {
  const floor = 1e-9;
  const home = Math.max(floor, probabilities.home);
  const draw = Math.max(floor, probabilities.draw);
  const away = Math.max(floor, probabilities.away);
  const total = home + draw + away;
  return {
    home: round(home / total, 8),
    draw: round(draw / total, 8),
    away: round(away / total, 8),
  };
}

function normalizeConfig(partial: Partial<BenchmarkModelConfig> = {}): BenchmarkModelConfig {
  const config = { ...defaultBenchmarkModelConfig, ...partial };
  const finite = Object.values(config).every((value) => Number.isFinite(value));
  if (!finite
    || config.eloInitialRating < 100
    || config.eloKFactor <= 0 || config.eloKFactor > 100
    || config.eloScale <= 0
    || config.eloBaseDrawProbability <= 0 || config.eloBaseDrawProbability >= 0.5
    || config.eloMinimumDrawProbability <= 0
    || config.eloMinimumDrawProbability > config.eloBaseDrawProbability
    || config.poissonHalfLifeDays < 14
    || config.poissonPriorMatches < 1
    || !Number.isInteger(config.poissonIterations) || config.poissonIterations < 3 || config.poissonIterations > 100
    || config.minimumExpectedGoals <= 0
    || config.maximumExpectedGoals <= config.minimumExpectedGoals
    || !Number.isInteger(config.maximumGoals) || config.maximumGoals < 5 || config.maximumGoals > 15
    || config.dixonColesRhoMinimum >= config.dixonColesRhoMaximum
    || config.dixonColesRhoStep <= 0) {
    throw new ModelLabValidationError("Benchmark model configuration is invalid.");
  }
  return config;
}

function validTimestamp(value: string | undefined, field: string) {
  const timestamp = typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(timestamp)) throw new ModelLabValidationError(`${field} must be a valid timestamp.`);
  return timestamp;
}

function validScore(value: number) {
  return Number.isInteger(value) && value >= 0 && value <= 30;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
