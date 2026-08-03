import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { featureDatasetRuns, featureDatasetSamples } from "@/db/schema";
import type { AdminActor } from "@/lib/admin-data";
import {
  BENCHMARK_SCHEMA_VERSION,
  defaultBenchmarkModelConfig,
  type BenchmarkForecast,
} from "@/lib/benchmark-models";
import {
  ModelLabValidationError,
  type BacktestConfig,
  type BacktestSample,
  type MarketOdds,
  type ProbabilityTriple,
} from "@/lib/model-lab";
import {
  runModelLabExperiment,
  type ModelCode,
} from "@/lib/model-lab-store";

const SUITE_MODEL_CODES: ModelCode[] = [
  "form-dominance-baseline",
  "elo-baseline",
  "poisson-baseline",
  "dixon-coles-baseline",
];

export async function runBenchmarkSuite(actor: AdminActor, datasetRunId: string) {
  if (typeof datasetRunId !== "string" || !datasetRunId.trim()) {
    throw new ModelLabValidationError("A feature dataset run id is required.");
  }
  const db = await getDb();
  const [dataset] = await db.select().from(featureDatasetRuns)
    .where(and(
      eq(featureDatasetRuns.id, datasetRunId.trim()),
      eq(featureDatasetRuns.status, "completed"),
    ))
    .limit(1);
  if (!dataset) throw new ModelLabValidationError("The completed feature dataset could not be found.");
  if (dataset.benchmarkSchemaVersion !== BENCHMARK_SCHEMA_VERSION) {
    throw new ModelLabValidationError("This dataset predates CP08 benchmarks; rebuild it with the current point-in-time builder.");
  }

  const rows = await db.select().from(featureDatasetSamples)
    .where(eq(featureDatasetSamples.datasetRunId, dataset.id))
    .orderBy(asc(featureDatasetSamples.kickoffAt), asc(featureDatasetSamples.fixtureId));
  if (rows.length < 30) {
    throw new ModelLabValidationError("A four-model comparison requires at least 30 immutable dataset samples.");
  }
  const parsed = rows.map((row) => ({ row, forecast: parseBenchmark(row.benchmarkJson, row.fixtureId) }));
  const backtestConfig = comparisonBacktestConfig(rows.length);
  const trainingCutoffAt = rows.reduce(
    (latest, row) => row.featureCutoffAt > latest ? row.featureCutoffAt : latest,
    rows[0].featureCutoffAt,
  );
  const runs = [];

  for (const modelCode of SUITE_MODEL_CODES) {
    const samples = parsed.map(({ row, forecast }) => toBacktestSample(
      row,
      probabilitiesForModel(modelCode, row, forecast),
      modelCode,
    ));
    const result = await runModelLabExperiment(actor, {
      name: trimName(`${modelLabel(modelCode)} · ${dataset.name}`),
      datasetKind: "historical",
      leagueId: dataset.leagueId,
      leagueLabel: dataset.leagueLabel,
      market: "1X2",
      samples,
      config: backtestConfig,
      modelCode,
      modelConfig: modelConfiguration(modelCode),
      featureSchemaVersion: modelCode === "form-dominance-baseline"
        ? dataset.featureSchemaVersion
        : dataset.benchmarkSchemaVersion,
      featureDatasetRunId: dataset.id,
      datasetChecksumSha256: dataset.datasetChecksumSha256,
      trainingCutoffAt,
      releaseGateEligible: false,
    });
    runs.push({
      runId: result.runId,
      modelVersionId: result.modelVersionId,
      modelCode: result.modelCode,
      modelName: result.modelName,
      metrics: result.metrics,
      releaseDecision: result.releaseDecision,
    });
  }

  const ranked = [...runs].sort((first, second) => (
    first.metrics.logLoss - second.metrics.logLoss
    || first.metrics.brierScore - second.metrics.brierScore
    || second.metrics.accuracy - first.metrics.accuracy
    || first.modelCode.localeCompare(second.modelCode)
  ));
  return {
    dataset: {
      id: dataset.id,
      name: dataset.name,
      leagueLabel: dataset.leagueLabel,
      sampleCount: rows.length,
      checksumSha256: dataset.datasetChecksumSha256,
      researchOnly: true,
    },
    backtestConfig,
    winnerModelCode: ranked[0].modelCode,
    runs,
  };
}

function toBacktestSample(
  row: typeof featureDatasetSamples.$inferSelect,
  probabilities: ProbabilityTriple,
  modelCode: ModelCode,
): BacktestSample {
  return {
    fixtureId: row.fixtureId,
    predictionAt: row.predictionAt,
    kickoffAt: row.kickoffAt,
    featureCutoffAt: row.featureCutoffAt,
    resultKnownAt: row.resultKnownAt,
    actualOutcome: row.actualOutcome,
    probabilities,
    odds: oddsFromRow(row),
    dataCompleteness: row.dataCompleteness,
    featureFingerprint: `${row.featureFingerprint}:${modelCode}:${BENCHMARK_SCHEMA_VERSION}`,
  };
}

function probabilitiesForModel(
  modelCode: ModelCode,
  row: typeof featureDatasetSamples.$inferSelect,
  forecast: BenchmarkForecast,
) {
  if (modelCode === "form-dominance-baseline") {
    return {
      home: row.probabilityHome,
      draw: row.probabilityDraw,
      away: row.probabilityAway,
    };
  }
  if (modelCode === "elo-baseline") return forecast.elo.probabilities;
  if (modelCode === "poisson-baseline") return forecast.poisson.probabilities;
  return forecast.dixonColes.probabilities;
}

function oddsFromRow(row: typeof featureDatasetSamples.$inferSelect): MarketOdds | undefined {
  if (row.oddsCapturedAt === null || row.oddsHome === null || row.oddsDraw === null || row.oddsAway === null) {
    return undefined;
  }
  return {
    capturedAt: row.oddsCapturedAt,
    home: row.oddsHome,
    draw: row.oddsDraw,
    away: row.oddsAway,
    closingHome: row.closingHome ?? undefined,
    closingDraw: row.closingDraw ?? undefined,
    closingAway: row.closingAway ?? undefined,
  };
}

function parseBenchmark(value: string, fixtureId: string): BenchmarkForecast {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new ModelLabValidationError(`Fixture ${fixtureId} has malformed benchmark provenance.`);
  }
  if (!isBenchmarkForecast(parsed)) {
    throw new ModelLabValidationError(`Fixture ${fixtureId} has incomplete benchmark provenance.`);
  }
  return parsed;
}

function isBenchmarkForecast(value: unknown): value is BenchmarkForecast {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<BenchmarkForecast>;
  return candidate.benchmarkSchemaVersion === BENCHMARK_SCHEMA_VERSION
    && validProbabilities(candidate.elo?.probabilities)
    && validProbabilities(candidate.poisson?.probabilities)
    && validProbabilities(candidate.dixonColes?.probabilities)
    && Number.isFinite(candidate.historyFixtureCount)
    && typeof candidate.historyCutoffAt === "string";
}

function validProbabilities(value: ProbabilityTriple | undefined) {
  if (!value) return false;
  const values = [value.home, value.draw, value.away];
  return values.every((item) => Number.isFinite(item) && item > 0)
    && Math.abs(values.reduce((sum, item) => sum + item, 0) - 1) <= 1e-5;
}

function comparisonBacktestConfig(sampleCount: number): Partial<BacktestConfig> {
  const minTrainSize = Math.min(60, Math.max(20, Math.floor(sampleCount * 0.5)));
  const remaining = sampleCount - minTrainSize;
  const testSize = Math.min(24, Math.max(8, Math.floor(remaining / 2)));
  return {
    minTrainSize,
    testSize,
    stepSize: testSize,
    embargoHours: 6,
  };
}

function modelConfiguration(modelCode: ModelCode): Record<string, unknown> {
  if (modelCode === "form-dominance-baseline") {
    return { branch: "form-dominance", h2hWeight: 0 };
  }
  if (modelCode === "elo-baseline") {
    return {
      benchmarkSchemaVersion: BENCHMARK_SCHEMA_VERSION,
      initialRating: defaultBenchmarkModelConfig.eloInitialRating,
      kFactor: defaultBenchmarkModelConfig.eloKFactor,
      scale: defaultBenchmarkModelConfig.eloScale,
      homeAdvantage: defaultBenchmarkModelConfig.eloHomeAdvantage,
      drawMethod: "expected-points-preserving",
    };
  }
  if (modelCode === "poisson-baseline") {
    return {
      benchmarkSchemaVersion: BENCHMARK_SCHEMA_VERSION,
      halfLifeDays: defaultBenchmarkModelConfig.poissonHalfLifeDays,
      priorMatches: defaultBenchmarkModelConfig.poissonPriorMatches,
      fit: "iterative-weighted-attack-defence",
      maximumGoals: defaultBenchmarkModelConfig.maximumGoals,
    };
  }
  return {
    benchmarkSchemaVersion: BENCHMARK_SCHEMA_VERSION,
    halfLifeDays: defaultBenchmarkModelConfig.poissonHalfLifeDays,
    priorMatches: defaultBenchmarkModelConfig.poissonPriorMatches,
    fit: "two-stage-weighted-poisson-plus-low-score-rho",
    rhoGrid: [
      defaultBenchmarkModelConfig.dixonColesRhoMinimum,
      defaultBenchmarkModelConfig.dixonColesRhoMaximum,
      defaultBenchmarkModelConfig.dixonColesRhoStep,
    ],
    maximumGoals: defaultBenchmarkModelConfig.maximumGoals,
  };
}

function modelLabel(modelCode: ModelCode) {
  const labels: Record<ModelCode, string> = {
    "form-dominance-baseline": "Form & Dominance",
    "elo-baseline": "Dynamic Elo",
    "poisson-baseline": "Time-decayed Poisson",
    "dixon-coles-baseline": "Dixon–Coles",
  };
  return labels[modelCode];
}

function trimName(value: string) {
  return value.length <= 100 ? value : `${value.slice(0, 97)}…`;
}
