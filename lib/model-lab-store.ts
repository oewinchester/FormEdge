import { count, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLogs,
  backtestPredictions,
  backtestRuns,
  modelDefinitions,
  modelVersions,
  releaseGates,
} from "@/db/schema";
import type { AdminActor } from "@/lib/admin-data";
import { BENCHMARK_SCHEMA_VERSION } from "@/lib/benchmark-models";
import {
  FEATURE_SCHEMA_VERSION,
  ModelLabValidationError,
  type BacktestConfig,
  type BacktestSample,
  type ReleaseStage,
  runBacktest,
} from "@/lib/model-lab";
import { getPointInTimeDatasetOverview } from "@/lib/point-in-time-dataset-store";

export type ModelCode =
  | "form-dominance-baseline"
  | "elo-baseline"
  | "poisson-baseline"
  | "dixon-coles-baseline";

const MODEL_SPECS: Record<ModelCode, {
  id: string;
  displayName: string;
  family: "heuristic" | "statistical";
  description: string;
  versionPrefix: string;
}> = {
  "form-dominance-baseline": {
    id: "model_form_dominance_baseline",
    displayName: "Form & Dominance Baseline",
    family: "heuristic",
    description: "Weighted last-5/10 form, venue context and advanced dominance evidence. H2H remains disabled until ablation validates a weight.",
    versionPrefix: "1.1.0",
  },
  "elo-baseline": {
    id: "model_elo_baseline",
    displayName: "Dynamic Elo Baseline",
    family: "statistical",
    description: "Chronological Elo strength with home advantage and a draw allocation that preserves expected match points.",
    versionPrefix: "0.1.0",
  },
  "poisson-baseline": {
    id: "model_poisson_baseline",
    displayName: "Time-decayed Poisson Baseline",
    family: "statistical",
    description: "Recency-weighted attack and defence strengths projected through an independent home-away goal matrix.",
    versionPrefix: "0.1.0",
  },
  "dixon-coles-baseline": {
    id: "model_dixon_coles_baseline",
    displayName: "Dixon–Coles Baseline",
    family: "statistical",
    description: "Time-decayed Poisson strengths with a fitted low-score dependence correction for 0-0, 1-0, 0-1 and 1-1.",
    versionPrefix: "0.1.0",
  },
};

export type ModelLabExperimentInput = {
  name: string;
  datasetKind: "historical" | "synthetic";
  leagueId?: string | null;
  leagueLabel: string;
  market: "1X2";
  samples: BacktestSample[];
  config?: Partial<BacktestConfig>;
  modelCode?: ModelCode;
  modelConfig?: Record<string, unknown>;
  featureSchemaVersion?: string;
  featureDatasetRunId?: string | null;
  datasetChecksumSha256?: string;
  trainingCutoffAt?: string | null;
  releaseGateEligible?: boolean;
};

export async function getModelLabOverview(actor: AdminActor) {
  const db = await getDb();
  const [
    [{ total: definitionCount }],
    [{ total: versionCount }],
    [{ total: runCount }],
    [{ total: gateCount }],
    datasetOverview,
  ] = await Promise.all([
    db.select({ total: count() }).from(modelDefinitions),
    db.select({ total: count() }).from(modelVersions),
    db.select({ total: count() }).from(backtestRuns),
    db.select({ total: count() }).from(releaseGates),
    getPointInTimeDatasetOverview(),
  ]);
  const runs = await db.select({
    id: backtestRuns.id,
    name: backtestRuns.name,
    featureDatasetRunId: backtestRuns.featureDatasetRunId,
    datasetKind: backtestRuns.datasetKind,
    leagueLabel: backtestRuns.leagueLabel,
    market: backtestRuns.market,
    status: backtestRuns.status,
    sourceSampleCount: backtestRuns.sourceSampleCount,
    sampleCount: backtestRuns.sampleCount,
    foldCount: backtestRuns.foldCount,
    accuracy: backtestRuns.accuracy,
    logLoss: backtestRuns.logLoss,
    brierScore: backtestRuns.brierScore,
    ece: backtestRuns.ece,
    netUnits: backtestRuns.netUnits,
    yield: backtestRuns.yield,
    maxDrawdownUnits: backtestRuns.maxDrawdownUnits,
    releaseStage: backtestRuns.releaseStage,
    startedAt: backtestRuns.startedAt,
    completedAt: backtestRuns.completedAt,
    versionLabel: modelVersions.versionLabel,
    modelCode: modelDefinitions.code,
    modelName: modelDefinitions.displayName,
  }).from(backtestRuns)
    .innerJoin(modelVersions, eq(backtestRuns.modelVersionId, modelVersions.id))
    .innerJoin(modelDefinitions, eq(modelVersions.modelDefinitionId, modelDefinitions.id))
    .orderBy(desc(backtestRuns.startedAt))
    .limit(20);
  const gates = await db.select({
    id: releaseGates.id,
    leagueLabel: releaseGates.leagueLabel,
    market: releaseGates.market,
    stage: releaseGates.stage,
    automatedRecommendationAllowed: releaseGates.automatedRecommendationAllowed,
    minimumEffectiveSample: releaseGates.minimumEffectiveSample,
    maximumEce: releaseGates.maximumEce,
    requiredDataCompleteness: releaseGates.requiredDataCompleteness,
    decidedAt: releaseGates.decidedAt,
  }).from(releaseGates).orderBy(desc(releaseGates.decidedAt)).limit(30);
  const versions = await db.select({
    id: modelVersions.id,
    versionLabel: modelVersions.versionLabel,
    featureSchemaVersion: modelVersions.featureSchemaVersion,
    status: modelVersions.status,
    trainingCutoffAt: modelVersions.trainingCutoffAt,
    definitionName: modelDefinitions.displayName,
    targetMarket: modelDefinitions.targetMarket,
  }).from(modelVersions)
    .innerJoin(modelDefinitions, eq(modelVersions.modelDefinitionId, modelDefinitions.id))
    .orderBy(desc(modelVersions.createdAt))
    .limit(12);

  return {
    actor,
    counts: {
      definitions: definitionCount,
      versions: versionCount,
      datasets: datasetOverview.count,
      runs: runCount,
      gates: gateCount,
    },
    datasets: datasetOverview.datasets,
    datasetReadiness: datasetOverview.readiness,
    runs,
    gates,
    versions,
    policy: {
      pointInTimeRequired: true,
      automatedGeneralRelease: false,
      maximumKellyMultiplier: 0.25,
      maximumStakeFraction: 0.02,
      minimumOdds: 1.2,
      minimumRecommendationDataCompleteness: 0.85,
      featureSchemaVersion: FEATURE_SCHEMA_VERSION,
      benchmarkSchemaVersion: BENCHMARK_SCHEMA_VERSION,
      dataset: datasetOverview.policy,
    },
  };
}

export async function runModelLabExperiment(actor: AdminActor, input: ModelLabExperimentInput) {
  validateExperimentInput(input);
  const modelCode = input.modelCode ?? "form-dominance-baseline";
  const modelSpec = MODEL_SPECS[modelCode];
  const result = runBacktest(input.samples, {
    config: input.config,
    datasetKind: input.datasetKind,
    researchOnly: input.datasetKind === "historical" && input.releaseGateEligible !== true,
  });
  const db = await getDb();
  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const configJson = canonicalJson({
    backtest: result.config,
    model: input.modelConfig ?? {},
  });
  const configChecksumSha256 = await sha256(configJson);
  const datasetChecksumSha256 = input.datasetChecksumSha256 ?? await sha256(canonicalJson(
    [...input.samples].sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt) || a.fixtureId.localeCompare(b.fixtureId)),
  ));
  const modelSlug = modelCode.replaceAll("-", "_");
  const modelVersionId = `model_${modelSlug}_${configChecksumSha256.slice(0, 20)}`;
  const modelVersionLabel = `${modelSpec.versionPrefix}-${configChecksumSha256.slice(0, 8)}`;

  await db.insert(modelDefinitions).values({
    id: modelSpec.id,
    code: modelCode,
    displayName: modelSpec.displayName,
    family: modelSpec.family,
    targetMarket: "1X2",
    status: "research",
    description: modelSpec.description,
    createdByEmail: actor.email,
    updatedAt: startedAt,
  }).onConflictDoUpdate({
    target: modelDefinitions.code,
    set: { description: modelSpec.description, updatedAt: startedAt },
  });
  const [definition] = await db.select({ id: modelDefinitions.id })
    .from(modelDefinitions)
    .where(eq(modelDefinitions.code, modelCode))
    .limit(1);
  if (!definition) throw new ModelLabValidationError("The baseline model definition could not be resolved.");
  await db.insert(modelVersions).values({
    id: modelVersionId,
    modelDefinitionId: definition.id,
    versionLabel: modelVersionLabel,
    featureSchemaVersion: input.featureSchemaVersion ?? FEATURE_SCHEMA_VERSION,
    configJson,
    configChecksumSha256,
    trainingCutoffAt: input.trainingCutoffAt ?? null,
    status: "candidate",
    createdByEmail: actor.email,
  }).onConflictDoNothing();

  const metrics = result.metrics;
  await db.insert(backtestRuns).values({
    id: runId,
    modelVersionId,
    name: input.name.trim(),
    datasetKind: input.datasetKind,
    datasetChecksumSha256,
    featureDatasetRunId: input.featureDatasetRunId ?? null,
    leagueId: input.leagueId || null,
    leagueLabel: input.leagueLabel.trim(),
    market: input.market,
    status: "running",
    evaluationMode: "walk_forward",
    sourceSampleCount: result.sourceSampleCount,
    sampleCount: metrics.sampleCount,
    foldCount: metrics.foldCount,
    leakageViolationCount: 0,
    dataCompleteness: metrics.dataCompleteness,
    accuracy: metrics.accuracy,
    logLoss: metrics.logLoss,
    brierScore: metrics.brierScore,
    ece: metrics.ece,
    calibrationSlope: metrics.calibrationSlope,
    calibrationIntercept: metrics.calibrationIntercept,
    benchmarkLogLoss: metrics.benchmarkLogLoss,
    benchmarkBrierScore: metrics.benchmarkBrierScore,
    recommendationCount: metrics.recommendationCount,
    netUnits: metrics.netUnits,
    yield: metrics.yield,
    profitFactor: metrics.profitFactor,
    averageClv: metrics.averageClv,
    maxDrawdownUnits: metrics.maxDrawdownUnits,
    maxLosingStreak: metrics.maxLosingStreak,
    releaseStage: result.releaseDecision.stage,
    configJson,
    metricsJson: JSON.stringify({ metrics, folds: result.folds, releaseDecision: result.releaseDecision }),
    createdByEmail: actor.email,
    startedAt,
    completedAt: null,
  });

  try {
    for (let index = 0; index < result.predictions.length; index += 50) {
      const statements = result.predictions.slice(index, index + 50).map((row) => db.insert(backtestPredictions).values({
        id: crypto.randomUUID(),
        backtestRunId: runId,
        fixtureKey: row.fixtureId,
        predictionAt: row.predictionAt,
        kickoffAt: row.kickoffAt,
        resultKnownAt: row.resultKnownAt ?? null,
        featureCutoffAt: row.featureCutoffAt,
        featureFingerprint: row.featureFingerprint,
        dataCompleteness: row.dataCompleteness,
        actualOutcome: row.actualOutcome,
        predictedOutcome: row.predictedOutcome,
        probabilityHome: row.probabilities.home,
        probabilityDraw: row.probabilities.draw,
        probabilityAway: row.probabilities.away,
        oddsCapturedAt: row.odds?.capturedAt ?? null,
        oddsHome: row.odds?.home ?? null,
        oddsDraw: row.odds?.draw ?? null,
        oddsAway: row.odds?.away ?? null,
        closingHome: row.odds?.closingHome ?? null,
        closingDraw: row.odds?.closingDraw ?? null,
        closingAway: row.odds?.closingAway ?? null,
        selectedOutcome: row.selectedOutcome,
        selectedProbability: row.selectedProbability,
        decimalOdds: row.decimalOdds,
        closingOdds: row.closingOdds,
        edge: row.edge,
        stakeUnits: row.stakeUnits,
        pnlUnits: row.pnlUnits,
        clv: row.clv,
      }));
      if (statements.length) {
        await db.batch(statements as [typeof statements[number], ...Array<typeof statements[number]>]);
      }
    }

    const completedAt = new Date().toISOString();
    const markCompleted = db.update(backtestRuns)
      .set({ status: "completed" as const, completedAt })
      .where(eq(backtestRuns.id, runId));
    const recordCompletion = db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      actorEmail: actor.email,
      action: "model.backtest.completed",
      entityType: "backtest_run",
      entityId: runId,
      detailsJson: JSON.stringify({
        datasetKind: input.datasetKind,
        modelCode,
        featureDatasetRunId: input.featureDatasetRunId ?? null,
        datasetChecksumSha256,
        leagueLabel: input.leagueLabel,
        market: input.market,
        sourceSampleCount: result.sourceSampleCount,
        effectiveSampleCount: metrics.sampleCount,
        releaseStage: result.releaseDecision.stage,
        modelVersionId,
        configChecksumSha256,
      }),
    });

    if (input.datasetKind === "historical" && input.releaseGateEligible === true) {
      const gateId = await stableGateId(input.leagueLabel, input.market);
      const updateGate = db.insert(releaseGates).values({
        id: gateId,
        leagueId: input.leagueId || null,
        leagueLabel: input.leagueLabel.trim(),
        market: input.market,
        stage: result.releaseDecision.stage,
        activeModelVersionId: modelVersionId,
        lastBacktestRunId: runId,
        automatedRecommendationAllowed: result.releaseDecision.automatedRecommendationAllowed,
        evidenceJson: JSON.stringify(result.releaseDecision),
        decidedByEmail: actor.email,
        decidedAt: completedAt,
        updatedAt: completedAt,
      }).onConflictDoUpdate({
        target: releaseGates.id,
        set: {
          leagueId: input.leagueId || null,
          leagueLabel: input.leagueLabel.trim(),
          stage: result.releaseDecision.stage,
          activeModelVersionId: modelVersionId,
          lastBacktestRunId: runId,
          automatedRecommendationAllowed: result.releaseDecision.automatedRecommendationAllowed,
          evidenceJson: JSON.stringify(result.releaseDecision),
          decidedByEmail: actor.email,
          decidedAt: completedAt,
          updatedAt: completedAt,
        },
      });
      await db.batch([markCompleted, recordCompletion, updateGate]);
    } else {
      await db.batch([markCompleted, recordCompletion]);
    }
  } catch (error) {
    const completedAt = new Date().toISOString();
    const errorMessage = error instanceof Error ? error.message.slice(0, 500) : "Backtest persistence failed.";
    try {
      await db.update(backtestRuns).set({ status: "failed", errorMessage, completedAt }).where(eq(backtestRuns.id, runId));
      await db.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorEmail: actor.email,
        action: "model.backtest.failed",
        entityType: "backtest_run",
        entityId: runId,
        detailsJson: JSON.stringify({ datasetChecksumSha256, modelVersionId, modelCode, errorMessage }),
      });
    } catch {
      // Preserve and rethrow the original storage error if failure logging is unavailable too.
    }
    throw error;
  }

  return { runId, modelVersionId, modelCode, modelName: modelSpec.displayName, ...result };
}

function validateExperimentInput(input: ModelLabExperimentInput) {
  if (!input || typeof input !== "object") throw new ModelLabValidationError("Experiment input is required.");
  if (typeof input.name !== "string" || input.name.trim().length < 4 || input.name.trim().length > 100) {
    throw new ModelLabValidationError("Experiment name must be between 4 and 100 characters.");
  }
  if (input.datasetKind !== "historical" && input.datasetKind !== "synthetic") {
    throw new ModelLabValidationError("datasetKind must be historical or synthetic.");
  }
  if (typeof input.leagueLabel !== "string" || input.leagueLabel.trim().length < 2 || input.leagueLabel.trim().length > 100) {
    throw new ModelLabValidationError("A league label is required.");
  }
  if (input.market !== "1X2") throw new ModelLabValidationError("The current Model Lab accepts only the 1X2 market.");
  if (!Array.isArray(input.samples)) throw new ModelLabValidationError("samples must be an array.");
  if (input.modelCode !== undefined && !Object.hasOwn(MODEL_SPECS, input.modelCode)) {
    throw new ModelLabValidationError("The requested modelCode is not registered.");
  }
  if (input.datasetChecksumSha256 !== undefined && !/^[a-f0-9]{64}$/.test(input.datasetChecksumSha256)) {
    throw new ModelLabValidationError("datasetChecksumSha256 must be a lowercase SHA-256 value.");
  }
  if (input.releaseGateEligible === true && input.datasetKind !== "historical") {
    throw new ModelLabValidationError("Only a verified historical dataset can be release-gate eligible.");
  }
}

async function stableGateId(leagueLabel: string, market: string) {
  const checksum = await sha256(`${leagueLabel.trim().toLowerCase()}|${market.toLowerCase()}`);
  return `gate_${checksum.slice(0, 20)}`;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function canonicalJson(value: unknown): string {
  if (value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([first], [second]) => first.localeCompare(second));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function stageLabel(stage: ReleaseStage) {
  return stage.replaceAll("_", " ");
}
