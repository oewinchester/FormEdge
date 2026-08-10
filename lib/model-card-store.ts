import { count, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, backtestRuns, featureDatasetRuns, modelDefinitions, modelEvidenceRuns, modelVersionCards, modelVersions, releaseGates } from "@/db/schema";
import type { AdminActor } from "@/lib/admin-data";
import { buildModelVersionCard, canonicalModelCardJson, type EvidenceModel, type ModelVersionCardInput } from "@/lib/model-card";

type CardData = Awaited<ReturnType<typeof loadCardData>>;
type StoredRow = CardData["storedRows"][number];

export async function getModelCardOverview(actor: AdminActor, requestedVersionId?: string | null) {
  const data = await loadCardData();
  const cards = await buildLiveCards(data);
  const selectedId = optionalId(requestedVersionId) ?? cards[0]?.input.version.id ?? null;
  const selected = selectedId ? cards.find((item) => item.input.version.id === selectedId) ?? null : null;
  if (selectedId && !selected) throw new ModelCardStoreError(404, "MODEL_VERSION_NOT_FOUND", "Model sürümü bulunamadı.");
  const latestStored = firstBy(data.storedRows, (row) => row.modelVersionId);
  const versions = cards.map((card) => {
    const stored = latestStored.get(card.input.version.id) ?? null;
    return {
      id: card.input.version.id,
      versionLabel: card.input.version.versionLabel,
      versionStatus: card.input.version.status,
      modelCode: card.input.model.code,
      modelName: card.input.model.displayName,
      family: card.input.model.family,
      market: card.input.model.targetMarket,
      createdAt: card.input.version.createdAt,
      cardStatus: card.manifest.cardStatus,
      blockerCount: card.manifest.blockerCodes.length,
      warningCount: card.manifest.warningCodes.length,
      evidenceFingerprintSha256: card.evidenceFingerprintSha256,
      snapshotState: snapshotState(stored, card.evidenceFingerprintSha256),
      lastSnapshotAt: stored?.createdAt ?? null,
    };
  });
  const history = selected ? data.storedRows.filter((row) => row.modelVersionId === selected.input.version.id).slice(0, 20)
    .map((row) => publicSnapshot(row, row.evidenceFingerprintSha256 === selected.evidenceFingerprintSha256)) : [];
  return {
    actor: { email: actor.email, displayName: actor.displayName, role: actor.role },
    generatedAt: new Date().toISOString(),
    counts: {
      modelVersions: versions.length,
      documented: versions.filter((row) => row.cardStatus === "documented").length,
      blocked: versions.filter((row) => row.cardStatus === "blocked").length,
      currentSnapshots: versions.filter((row) => row.snapshotState === "current").length,
      storedSnapshots: Number(data.storedCount ?? 0),
    },
    versions,
    selected: selected ? {
      manifest: selected.manifest,
      evidenceFingerprintSha256: selected.evidenceFingerprintSha256,
      snapshotState: snapshotState(latestStored.get(selected.input.version.id) ?? null, selected.evidenceFingerprintSha256),
      history,
    } : null,
    policy: { schemaVersion: "model-version-card-v1", sourceUnit: "model_version", immutableSnapshots: true, researchOnly: true, recommendationEligible: false, cardCanOpenReleaseGate: false, cardCanChangeModelStatus: false, blockersFailClosed: true },
  };
}

export async function persistModelVersionCard(actor: AdminActor, rawId: string) {
  const versionId = requiredId(rawId);
  const data = await loadCardData();
  const card = (await buildLiveCards(data)).find((item) => item.input.version.id === versionId);
  if (!card) throw new ModelCardStoreError(404, "MODEL_VERSION_NOT_FOUND", "Model sürümü bulunamadı.");
  const db = await getDb();
  const [existing] = await db.select().from(modelVersionCards).where(eq(modelVersionCards.evidenceFingerprintSha256, card.evidenceFingerprintSha256)).limit(1);
  if (existing) return { reused: true, snapshot: publicSnapshot(existing, true) };
  const id = crypto.randomUUID();
  const manifest = card.manifest;
  const inserted = await db.insert(modelVersionCards).values({
    id, modelVersionId: manifest.version.id, schemaVersion: manifest.schemaVersion,
    evidenceFingerprintSha256: card.evidenceFingerprintSha256, cardStatus: manifest.cardStatus,
    datasetRunId: manifest.trainingData.datasetRunId, backtestRunId: manifest.evaluation.backtestRunId,
    evidenceRunId: manifest.evaluation.evidenceRunId, releaseGateId: manifest.governance.releaseGateId,
    blockerCount: manifest.blockerCodes.length, warningCount: manifest.warningCodes.length,
    blockerCodesJson: canonicalModelCardJson(manifest.blockerCodes), warningCodesJson: canonicalModelCardJson(manifest.warningCodes),
    manifestJson: canonicalModelCardJson(manifest), researchOnly: true, recommendationEligible: false,
    generatedByEmail: actor.email, evidenceAsOf: manifest.evidenceAsOf,
  }).onConflictDoNothing();
  if (changedRows(inserted) === 0) {
    const [raced] = await db.select().from(modelVersionCards).where(eq(modelVersionCards.evidenceFingerprintSha256, card.evidenceFingerprintSha256)).limit(1);
    if (raced) return { reused: true, snapshot: publicSnapshot(raced, true) };
    throw new Error("Model card snapshot could not be persisted.");
  }
  await db.insert(auditLogs).values({
    id: crypto.randomUUID(), actorEmail: actor.email, action: "model.card.persisted", entityType: "model_version_card", entityId: id,
    detailsJson: canonicalModelCardJson({ modelVersionId: manifest.version.id, modelCode: manifest.identity.code, cardStatus: manifest.cardStatus, evidenceFingerprintSha256: card.evidenceFingerprintSha256, blockerCodes: manifest.blockerCodes, warningCodes: manifest.warningCodes, researchOnly: true, recommendationEligible: false, cardCanOpenReleaseGate: false }),
  });
  const [stored] = await db.select().from(modelVersionCards).where(eq(modelVersionCards.id, id)).limit(1);
  if (!stored) throw new Error("Persisted model card snapshot could not be loaded.");
  return { reused: false, snapshot: publicSnapshot(stored, true) };
}

async function loadCardData() {
  const db = await getDb();
  const [versionRows, backtestRows, datasetRows, evidenceRows, gateRows, storedRows, [{ total: storedCount }]] = await Promise.all([
    db.select({ version: modelVersions, model: modelDefinitions }).from(modelVersions).innerJoin(modelDefinitions, eq(modelVersions.modelDefinitionId, modelDefinitions.id)).orderBy(desc(modelVersions.createdAt)).limit(200),
    db.select().from(backtestRuns).orderBy(desc(backtestRuns.startedAt)).limit(500),
    db.select().from(featureDatasetRuns).orderBy(desc(featureDatasetRuns.startedAt)).limit(300),
    db.select().from(modelEvidenceRuns).orderBy(desc(modelEvidenceRuns.startedAt)).limit(300),
    db.select().from(releaseGates).orderBy(desc(releaseGates.decidedAt)).limit(200),
    db.select().from(modelVersionCards).orderBy(desc(modelVersionCards.createdAt)).limit(500),
    db.select({ total: count() }).from(modelVersionCards),
  ]);
  return { versionRows, backtestRows, datasetRows, evidenceRows, gateRows, storedRows, storedCount };
}

async function buildLiveCards(data: CardData) {
  const latestBacktest = firstBy(data.backtestRows, (row) => row.modelVersionId);
  const datasets = new Map(data.datasetRows.map((row) => [row.id, row]));
  const latestEvidence = firstBy(data.evidenceRows, (row) => row.datasetRunId);
  const gateByVersion = firstBy(data.gateRows.filter((row) => row.activeModelVersionId), (row) => row.activeModelVersionId!);
  const gateByBacktest = firstBy(data.gateRows.filter((row) => row.lastBacktestRunId), (row) => row.lastBacktestRunId!);
  return Promise.all(data.versionRows.map(async ({ version, model }) => {
    const backtest = latestBacktest.get(version.id) ?? null;
    const dataset = backtest?.featureDatasetRunId ? datasets.get(backtest.featureDatasetRunId) ?? null : null;
    const evidence = dataset ? latestEvidence.get(dataset.id) ?? null : null;
    const gate = gateByVersion.get(version.id) ?? (backtest ? gateByBacktest.get(backtest.id) ?? null : null);
    const input: ModelVersionCardInput = {
      evidenceAsOf: latestIso([version.updatedAt, model.updatedAt, backtest?.completedAt, dataset?.completedAt, evidence?.completedAt, gate?.decidedAt], version.createdAt),
      model: { id: model.id, code: model.code, displayName: model.displayName, family: model.family, targetMarket: model.targetMarket, status: model.status, description: model.description },
      version: { id: version.id, versionLabel: version.versionLabel, featureSchemaVersion: version.featureSchemaVersion, configChecksumSha256: version.configChecksumSha256, trainingCutoffAt: version.trainingCutoffAt, status: version.status, createdAt: version.createdAt },
      dataset: dataset ? { id: dataset.id, name: dataset.name, status: dataset.status, checksumSha256: dataset.datasetChecksumSha256, featureSchemaVersion: dataset.featureSchemaVersion, eligibleSampleCount: dataset.eligibleSampleCount, averageDataCompleteness: dataset.averageDataCompleteness, leakageViolationCount: leakageCount(dataset.auditJson), completedAt: dataset.completedAt } : null,
      backtest: backtest ? { id: backtest.id, status: backtest.status, datasetKind: backtest.datasetKind, datasetChecksumSha256: backtest.datasetChecksumSha256, featureDatasetRunId: backtest.featureDatasetRunId, leagueLabel: backtest.leagueLabel, market: backtest.market, evaluationMode: backtest.evaluationMode, sourceSampleCount: backtest.sourceSampleCount, sampleCount: backtest.sampleCount, foldCount: backtest.foldCount, leakageViolationCount: backtest.leakageViolationCount, dataCompleteness: backtest.dataCompleteness, accuracy: backtest.accuracy, logLoss: backtest.logLoss, brierScore: backtest.brierScore, ece: backtest.ece, releaseStage: backtest.releaseStage, completedAt: backtest.completedAt } : null,
      evidence: evidence ? { id: evidence.id, status: evidence.status, schemaVersion: evidence.evidenceSchemaVersion, configChecksumSha256: evidence.configChecksumSha256, datasetChecksumSha256: evidence.datasetChecksumSha256, researchOnly: evidence.researchOnly, evidenceStatus: evidence.evidenceStatus, developmentCount: evidence.developmentCount, calibrationCount: evidence.calibrationCount, holdoutCount: evidence.holdoutCount, holdoutStartAt: evidence.holdoutStartAt, holdoutEndAt: evidence.holdoutEndAt, model: evidenceModel(evidence.modelsJson, model.code), completedAt: evidence.completedAt } : null,
      releaseGate: gate ? { id: gate.id, stage: gate.stage, activeModelVersionId: gate.activeModelVersionId, lastBacktestRunId: gate.lastBacktestRunId, automatedRecommendationAllowed: gate.automatedRecommendationAllowed, evidenceSummary: releaseSummary(gate.evidenceJson), decidedAt: gate.decidedAt } : null,
    };
    return { input, ...await buildModelVersionCard(input) };
  }));
}

function evidenceModel(value: string, code: string): EvidenceModel | null {
  try {
    const rows = JSON.parse(value) as unknown;
    if (!Array.isArray(rows)) return null;
    const candidate = rows.find((row) => row && typeof row === "object" && (row as { modelCode?: unknown }).modelCode === code) as Partial<EvidenceModel> | undefined;
    if (!candidate || !candidate.calibration || !candidate.calibratedHoldout || !candidate.logLossVsUniform || typeof candidate.status !== "string") return null;
    return candidate as EvidenceModel;
  } catch { return null; }
}
function releaseSummary(value: string) { try { const parsed = JSON.parse(value) as { reasons?: unknown }; return Array.isArray(parsed.reasons) ? parsed.reasons.filter((item): item is string => typeof item === "string").slice(0, 12) : []; } catch { return []; } }
function leakageCount(value: string) { try { const result = Number((JSON.parse(value) as { leakageViolationCount?: unknown }).leakageViolationCount ?? 0); return Number.isFinite(result) ? Math.max(0, Math.floor(result)) : 0; } catch { return 0; } }
function firstBy<T>(rows: T[], key: (row: T) => string) { const map = new Map<string, T>(); for (const row of rows) { const id = key(row); if (!map.has(id)) map.set(id, row); } return map; }
function snapshotState(row: StoredRow | null, fingerprint: string) { return !row ? "missing" as const : row.evidenceFingerprintSha256 === fingerprint ? "current" as const : "stale" as const; }
function publicSnapshot(row: StoredRow, current: boolean) { return { id: row.id, modelVersionId: row.modelVersionId, schemaVersion: row.schemaVersion, evidenceFingerprintSha256: row.evidenceFingerprintSha256, cardStatus: row.cardStatus, blockerCount: row.blockerCount, warningCount: row.warningCount, researchOnly: row.researchOnly, recommendationEligible: row.recommendationEligible, generatedByEmail: row.generatedByEmail, evidenceAsOf: row.evidenceAsOf, createdAt: row.createdAt, current }; }
function latestIso(values: Array<string | null | undefined>, fallback: string) { const timestamps = [...values, fallback].map((value) => value ? Date.parse(value) : Number.NaN).filter(Number.isFinite); return new Date(timestamps.length ? Math.max(...timestamps) : 0).toISOString(); }
function requiredId(value: unknown) { if (typeof value !== "string" || !value.trim() || value.length > 128) throw new ModelCardStoreError(400, "MODEL_VERSION_ID_INVALID", "Model sürümü kimliği geçersiz."); return value.trim(); }
function optionalId(value?: string | null) { return value === undefined || value === null || value === "" ? null : requiredId(value); }
function changedRows(value: unknown) { if (!value || typeof value !== "object") return 0; const meta = "meta" in value ? (value as { meta?: { changes?: number } }).meta : null; return Number(meta?.changes ?? 0); }

export class ModelCardStoreError extends Error { constructor(public status: 400 | 404, public code: string, message: string) { super(message); } }
export type ModelCardOverview = Awaited<ReturnType<typeof getModelCardOverview>>;
