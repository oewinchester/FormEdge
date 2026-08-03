import { and, asc, count, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLogs,
  featureDatasetRuns,
  featureDatasetSamples,
  modelEvidenceRuns,
} from "@/db/schema";
import type { AdminActor } from "@/lib/admin-data";
import {
  BENCHMARK_SCHEMA_VERSION,
  type BenchmarkForecast,
} from "@/lib/benchmark-models";
import {
  ABLATION_SCHEMA_VERSION,
  EVIDENCE_SCHEMA_VERSION,
  FORM_ABLATION_CODES,
  defaultEvidenceAnalysisConfig,
  runEvidenceAnalysis,
  type EvidenceModelCode,
  type EvidenceObservation,
  type FormAblationForecast,
  type ProbabilityMetrics,
} from "@/lib/evidence-lab";
import {
  ModelLabValidationError,
  type ProbabilityTriple,
} from "@/lib/model-lab";

const MINIMUM_EVIDENCE_SAMPLES = 90;

export type EvidenceModelSummary = {
  modelCode: EvidenceModelCode;
  status: "blocked" | "insufficient" | "inconclusive" | "candidate";
  calibration: {
    fittedTemperature: number;
    selectedTemperature: number;
    accepted: boolean;
    calibrationRawLogLoss: number;
    calibrationFittedLogLoss: number;
    calibrationGain: number;
  };
  rawHoldout: ProbabilityMetrics;
  calibratedHoldout: ProbabilityMetrics;
  logLossVsUniform: { delta: number; lower95: number; upper95: number };
};

export type EvidenceMatrixSummary = {
  id: string;
  datasetRunId: string;
  datasetChecksumSha256: string;
  leagueId: string;
  leagueLabel: string;
  market: "1X2";
  status: "running" | "completed" | "failed";
  evidenceSchemaVersion: string;
  researchOnly: boolean;
  developmentCount: number;
  calibrationCount: number;
  holdoutCount: number;
  holdoutStartAt: string | null;
  holdoutEndAt: string | null;
  selectedFormVariant: string | null;
  reportedLeaderModelCode: string | null;
  evidenceStatus: "blocked" | "insufficient" | "inconclusive" | "candidate";
  models: EvidenceModelSummary[];
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
};

export async function getEvidenceMatrixOverview() {
  const db = await getDb();
  const [[{ total }], rows] = await Promise.all([
    db.select({ total: count() }).from(modelEvidenceRuns),
    db.select().from(modelEvidenceRuns).orderBy(desc(modelEvidenceRuns.startedAt)).limit(50),
  ]);
  return {
    count: total,
    minimumEvidenceSamples: MINIMUM_EVIDENCE_SAMPLES,
    evidenceSchemaVersion: EVIDENCE_SCHEMA_VERSION,
    rows: rows.map(toEvidenceSummary),
  };
}

export async function runEvidenceSuite(actor: AdminActor, datasetRunId: string) {
  if (typeof datasetRunId !== "string" || !datasetRunId.trim()) {
    throw new ModelLabValidationError("A feature dataset run id is required for evidence analysis.");
  }
  const db = await getDb();
  const [dataset] = await db.select().from(featureDatasetRuns)
    .where(and(
      eq(featureDatasetRuns.id, datasetRunId.trim()),
      eq(featureDatasetRuns.status, "completed"),
    ))
    .limit(1);
  if (!dataset) throw new ModelLabValidationError("The completed feature dataset could not be found.");
  if (dataset.benchmarkSchemaVersion !== BENCHMARK_SCHEMA_VERSION
    || dataset.ablationSchemaVersion !== ABLATION_SCHEMA_VERSION) {
    throw new ModelLabValidationError("This dataset predates CP09 evidence provenance; rebuild it with the current point-in-time builder.");
  }

  const [existing] = await db.select().from(modelEvidenceRuns)
    .where(eq(modelEvidenceRuns.datasetRunId, dataset.id))
    .limit(1);
  if (existing?.status === "completed") {
    return { evidence: hydrateEvidence(existing, dataset.name), reused: true };
  }
  if (existing?.status === "running") {
    throw new ModelLabValidationError("This immutable dataset already has an evidence run in progress.");
  }

  const rows = await db.select().from(featureDatasetSamples)
    .where(eq(featureDatasetSamples.datasetRunId, dataset.id))
    .orderBy(asc(featureDatasetSamples.kickoffAt), asc(featureDatasetSamples.fixtureId));
  if (rows.length < MINIMUM_EVIDENCE_SAMPLES) {
    throw new ModelLabValidationError(`CP09 temporal evidence requires at least ${MINIMUM_EVIDENCE_SAMPLES} immutable samples.`);
  }
  const observations = rows.map(toEvidenceObservation);
  const configJson = canonicalJson(defaultEvidenceAnalysisConfig);
  const configChecksumSha256 = await sha256(configJson);
  const evidenceId = existing?.id ?? crypto.randomUUID();
  const startedAt = new Date().toISOString();

  if (existing) {
    await db.update(modelEvidenceRuns).set({
      status: "running",
      configJson,
      configChecksumSha256,
      errorMessage: null,
      startedAt,
      completedAt: null,
    }).where(eq(modelEvidenceRuns.id, evidenceId));
  } else {
    await db.insert(modelEvidenceRuns).values({
      id: evidenceId,
      datasetRunId: dataset.id,
      datasetChecksumSha256: dataset.datasetChecksumSha256,
      leagueId: dataset.leagueId,
      leagueLabel: dataset.leagueLabel,
      market: "1X2",
      status: "running",
      evidenceSchemaVersion: EVIDENCE_SCHEMA_VERSION,
      configJson,
      configChecksumSha256,
      researchOnly: true,
      createdByEmail: actor.email,
      startedAt,
    });
  }

  try {
    const analysis = runEvidenceAnalysis({
      observations,
      researchOnly: true,
      config: defaultEvidenceAnalysisConfig,
    });
    const completedAt = new Date().toISOString();
    const complete = db.update(modelEvidenceRuns).set({
      status: "completed",
      developmentCount: analysis.partition.developmentCount,
      calibrationCount: analysis.partition.calibrationCount,
      holdoutCount: analysis.partition.holdoutCount,
      holdoutStartAt: analysis.partition.boundaries.holdoutStartAt,
      holdoutEndAt: analysis.partition.boundaries.holdoutEndAt,
      selectedFormVariant: analysis.ablation.selectedFormVariant,
      reportedLeaderModelCode: analysis.holdoutLeaderModelCode,
      evidenceStatus: analysis.status,
      partitionJson: canonicalJson(analysis.partition),
      ablationJson: canonicalJson(analysis.ablation),
      modelsJson: canonicalJson(analysis.models),
      completedAt,
    }).where(eq(modelEvidenceRuns.id, evidenceId));
    const audit = db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      actorEmail: actor.email,
      action: "model.evidence.completed",
      entityType: "model_evidence_run",
      entityId: evidenceId,
      detailsJson: canonicalJson({
        datasetRunId: dataset.id,
        datasetChecksumSha256: dataset.datasetChecksumSha256,
        evidenceSchemaVersion: EVIDENCE_SCHEMA_VERSION,
        configChecksumSha256,
        researchOnly: true,
        partition: analysis.partition,
        selectedFormVariant: analysis.ablation.selectedFormVariant,
        holdoutLeaderModelCode: analysis.holdoutLeaderModelCode,
        status: analysis.status,
      }),
    });
    await db.batch([complete, audit]);
    return {
      evidence: {
        id: evidenceId,
        dataset: {
          id: dataset.id,
          name: dataset.name,
          leagueLabel: dataset.leagueLabel,
          checksumSha256: dataset.datasetChecksumSha256,
        },
        ...analysis,
      },
      reused: false,
    };
  } catch (error) {
    const completedAt = new Date().toISOString();
    const errorMessage = error instanceof Error ? error.message.slice(0, 500) : "Evidence analysis failed.";
    try {
      await db.batch([
        db.update(modelEvidenceRuns).set({ status: "failed", errorMessage, completedAt }).where(eq(modelEvidenceRuns.id, evidenceId)),
        db.insert(auditLogs).values({
          id: crypto.randomUUID(),
          actorEmail: actor.email,
          action: "model.evidence.failed",
          entityType: "model_evidence_run",
          entityId: evidenceId,
          detailsJson: canonicalJson({ datasetRunId: dataset.id, datasetChecksumSha256: dataset.datasetChecksumSha256, errorMessage }),
        }),
      ]);
    } catch {
      // Preserve the original analysis or persistence failure.
    }
    throw error;
  }
}

function toEvidenceObservation(row: typeof featureDatasetSamples.$inferSelect): EvidenceObservation {
  const benchmark = parseBenchmark(row.benchmarkJson, row.fixtureId);
  const ablations = parseAblations(row.ablationJson, row.fixtureId);
  return {
    fixtureId: row.fixtureId,
    predictionAt: row.predictionAt,
    kickoffAt: row.kickoffAt,
    resultKnownAt: row.resultKnownAt,
    actualOutcome: row.actualOutcome,
    dataCompleteness: row.dataCompleteness,
    forecasts: {
      "form-dominance-baseline": {
        home: row.probabilityHome,
        draw: row.probabilityDraw,
        away: row.probabilityAway,
      },
      "elo-baseline": benchmark.elo.probabilities,
      "poisson-baseline": benchmark.poisson.probabilities,
      "dixon-coles-baseline": benchmark.dixonColes.probabilities,
    },
    ablations,
  };
}

function parseBenchmark(value: string, fixtureId: string): BenchmarkForecast {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new ModelLabValidationError(`Fixture ${fixtureId} has malformed benchmark evidence.`);
  }
  if (!parsed || typeof parsed !== "object") throw new ModelLabValidationError(`Fixture ${fixtureId} has missing benchmark evidence.`);
  const candidate = parsed as Partial<BenchmarkForecast>;
  if (candidate.benchmarkSchemaVersion !== BENCHMARK_SCHEMA_VERSION
    || !validProbabilities(candidate.elo?.probabilities)
    || !validProbabilities(candidate.poisson?.probabilities)
    || !validProbabilities(candidate.dixonColes?.probabilities)) {
    throw new ModelLabValidationError(`Fixture ${fixtureId} has incomplete benchmark evidence.`);
  }
  return candidate as BenchmarkForecast;
}

function parseAblations(value: string, fixtureId: string): FormAblationForecast {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new ModelLabValidationError(`Fixture ${fixtureId} has malformed ablation evidence.`);
  }
  if (!parsed || typeof parsed !== "object") throw new ModelLabValidationError(`Fixture ${fixtureId} has missing ablation evidence.`);
  const candidate = parsed as Partial<FormAblationForecast>;
  if (candidate.ablationSchemaVersion !== ABLATION_SCHEMA_VERSION
    || !candidate.variants
    || FORM_ABLATION_CODES.some((code) => !validProbabilities(candidate.variants?.[code]?.probabilities))) {
    throw new ModelLabValidationError(`Fixture ${fixtureId} has incomplete ablation evidence.`);
  }
  return candidate as FormAblationForecast;
}

function validProbabilities(value: ProbabilityTriple | undefined) {
  if (!value) return false;
  const values = [value.home, value.draw, value.away];
  return values.every((item) => Number.isFinite(item) && item > 0 && item < 1)
    && Math.abs(values.reduce((sum, item) => sum + item, 0) - 1) <= 1e-5;
}

function hydrateEvidence(row: typeof modelEvidenceRuns.$inferSelect, datasetName: string) {
  return {
    id: row.id,
    dataset: {
      id: row.datasetRunId,
      name: datasetName,
      leagueLabel: row.leagueLabel,
      checksumSha256: row.datasetChecksumSha256,
    },
    evidenceSchemaVersion: row.evidenceSchemaVersion,
    researchOnly: row.researchOnly,
    status: row.evidenceStatus,
    partition: parseJson<Record<string, unknown>>(row.partitionJson, {}),
    ablation: parseJson<Record<string, unknown>>(row.ablationJson, {}),
    holdoutLeaderModelCode: row.reportedLeaderModelCode,
    models: parseJson<EvidenceModelSummary[]>(row.modelsJson, []),
  };
}

function toEvidenceSummary(row: typeof modelEvidenceRuns.$inferSelect): EvidenceMatrixSummary {
  return {
    id: row.id,
    datasetRunId: row.datasetRunId,
    datasetChecksumSha256: row.datasetChecksumSha256,
    leagueId: row.leagueId,
    leagueLabel: row.leagueLabel,
    market: row.market,
    status: row.status,
    evidenceSchemaVersion: row.evidenceSchemaVersion,
    researchOnly: row.researchOnly,
    developmentCount: row.developmentCount,
    calibrationCount: row.calibrationCount,
    holdoutCount: row.holdoutCount,
    holdoutStartAt: row.holdoutStartAt,
    holdoutEndAt: row.holdoutEndAt,
    selectedFormVariant: row.selectedFormVariant,
    reportedLeaderModelCode: row.reportedLeaderModelCode,
    evidenceStatus: row.evidenceStatus,
    models: parseJson<EvidenceModelSummary[]>(row.modelsJson, []),
    errorMessage: row.errorMessage,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
  };
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
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

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
