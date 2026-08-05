export const DATA_LINEAGE_SCHEMA_VERSION = "prediction-lineage-v1" as const;

const LINEAGE_SOURCE_PURPOSES = ["target_fixture", "benchmark_fixture", "historical_stat", "market_odds", "lineup", "fixture_context"] as const;
const LINEAGE_ENTITY_TYPES = ["fixture", "team_match_stat", "odds_snapshot", "lineup_snapshot", "fixture_context_snapshot"] as const;
const LINEAGE_BLOCKER_CODES = [
  "LINEAGE_MANIFEST_MISSING", "LINEAGE_MANIFEST_MALFORMED",
  "SOURCE_REFERENCES_MISSING", "SOURCE_RUN_LINK_MISSING", "TARGET_FIXTURE_SOURCE_MISSING",
  "HISTORICAL_SOURCE_LINK_MISSING", "ODDS_SOURCE_LINK_MISSING", "LINEUP_SOURCE_LINK_MISSING", "CONTEXT_SOURCE_LINK_MISSING",
  "INGESTION_RUN_MISSING", "INGESTION_RUN_INCOMPLETE",
  "RAW_SNAPSHOT_REFERENCE_MISSING", "RAW_SNAPSHOT_MISSING", "RAW_SNAPSHOT_UNVERIFIED",
  "SOURCE_CAPTURE_TIME_INVALID", "SOURCE_CAPTURE_AFTER_PREDICTION", "SOURCE_LICENSE_UNAPPROVED",
  "FEATURE_FINGERPRINT_MISSING", "FEATURE_CUTOFF_INVALID", "FEATURE_CUTOFF_AFTER_PREDICTION",
  "MODEL_VERSION_MISSING", "MODEL_RECORD_MISSING", "PUBLISH_DECISION_MISSING",
] as const;

export type LineageSourcePurpose = (typeof LINEAGE_SOURCE_PURPOSES)[number];
export type LineageEntityType = (typeof LINEAGE_ENTITY_TYPES)[number];
export type LineageBlockerCode = (typeof LINEAGE_BLOCKER_CODES)[number];

export type LineageSourceReference = { purpose: LineageSourcePurpose; entityType: LineageEntityType; entityId: string; ingestionRunId: string | null };
export type PredictionLineageManifest = {
  schemaVersion: typeof DATA_LINEAGE_SCHEMA_VERSION;
  predictionVersionId: string; threadId: string; fixtureId: string; predictionAt: string; featureCutoffAt: string;
  featureFingerprint: string; modelCode: string; modelVersionId: string | null;
  normalized: {
    targetFixtureId: string; homeHistoryFixtureIds: string[]; awayHistoryFixtureIds: string[]; h2hFixtureIds: string[];
    benchmarkHistoryFingerprint: string; selectedOddsSnapshotIds: string[]; lineupSnapshotIds: string[]; contextSnapshotId: string | null;
  };
  sourceReferences: LineageSourceReference[]; blockerCodes: LineageBlockerCode[]; researchOnly: true; recommendationEligible: false;
};
export type BuildPredictionLineageInput = Omit<PredictionLineageManifest, "schemaVersion" | "sourceReferences" | "blockerCodes" | "researchOnly" | "recommendationEligible" | "normalized"> & { sourceReferences: LineageSourceReference[]; normalized: PredictionLineageManifest["normalized"] };
export type LineageRunEvidence = { id: string; sourceName: string | null; legalStatus: "approved" | "review" | "blocked" | null; status: "processing" | "completed" | "failed" | null; capturedAt: string | null; snapshotKey: string | null; checksumSha256: string | null; rawObjectExists: boolean | null };
export type LineageModelEvidence = { id: string; versionLabel: string; modelCode: string; modelName: string; status: "candidate" | "champion" | "retired" } | null;
export type LineagePublishEvidence = { threadId: string; threadStatus: "watchlist" | "final" | "withdrawn" | "expired"; versionNumber: number; eventCount: number; researchOnly: boolean; recommendationEligible: boolean } | null;
export type LineageStage = { id: "raw" | "normalized" | "feature" | "model" | "publish"; status: "complete" | "blocked"; blockerCodes: LineageBlockerCode[]; evidence: Array<{ label: string; value: string }> };
export type PredictionLineageGraph = { status: "complete" | "blocked"; blockerCodes: LineageBlockerCode[]; stages: LineageStage[]; policy: { researchOnly: true; recommendationEligible: false; rawPayloadExposed: false; missingLinksFailClosed: true } };

export async function buildPredictionLineageManifest(input: BuildPredictionLineageInput): Promise<{ manifest: PredictionLineageManifest; checksumSha256: string }> {
  requireIdentifier(input.predictionVersionId, "predictionVersionId"); requireIdentifier(input.threadId, "threadId"); requireIdentifier(input.fixtureId, "fixtureId"); requireIdentifier(input.normalized.targetFixtureId, "normalized.targetFixtureId");
  const sourceReferences = normalizeSourceReferences(input.sourceReferences);
  const normalized: PredictionLineageManifest["normalized"] = {
    targetFixtureId: input.normalized.targetFixtureId.trim(), homeHistoryFixtureIds: uniqueSorted(input.normalized.homeHistoryFixtureIds), awayHistoryFixtureIds: uniqueSorted(input.normalized.awayHistoryFixtureIds),
    h2hFixtureIds: uniqueSorted(input.normalized.h2hFixtureIds), benchmarkHistoryFingerprint: input.normalized.benchmarkHistoryFingerprint.trim(), selectedOddsSnapshotIds: uniqueSorted(input.normalized.selectedOddsSnapshotIds),
    lineupSnapshotIds: uniqueSorted(input.normalized.lineupSnapshotIds), contextSnapshotId: nullableIdentifier(input.normalized.contextSnapshotId),
  };
  const blockerCodes = evaluateStructuralBlockers({ ...input, normalized, sourceReferences });
  const manifest: PredictionLineageManifest = { schemaVersion: DATA_LINEAGE_SCHEMA_VERSION, predictionVersionId: input.predictionVersionId.trim(), threadId: input.threadId.trim(), fixtureId: input.fixtureId.trim(), predictionAt: input.predictionAt, featureCutoffAt: input.featureCutoffAt, featureFingerprint: input.featureFingerprint.trim(), modelCode: input.modelCode.trim(), modelVersionId: nullableIdentifier(input.modelVersionId), normalized, sourceReferences, blockerCodes, researchOnly: true, recommendationEligible: false };
  return { manifest, checksumSha256: await sha256(canonicalLineageJson(manifest)) };
}

export function inspectPredictionLineage(input: { manifest: PredictionLineageManifest | null; manifestMalformed?: boolean; runs: LineageRunEvidence[]; model: LineageModelEvidence; publish: LineagePublishEvidence }): PredictionLineageGraph {
  const rawBlockers = new Set<LineageBlockerCode>(); const normalizedBlockers = new Set<LineageBlockerCode>(); const featureBlockers = new Set<LineageBlockerCode>(); const modelBlockers = new Set<LineageBlockerCode>(); const publishBlockers = new Set<LineageBlockerCode>(); const manifest = input.manifest;
  if (!manifest) {
    const code: LineageBlockerCode = input.manifestMalformed ? "LINEAGE_MANIFEST_MALFORMED" : "LINEAGE_MANIFEST_MISSING"; rawBlockers.add(code); normalizedBlockers.add(code); featureBlockers.add(code); modelBlockers.add(code);
  } else {
    for (const code of manifest.blockerCodes) stageBlocker(code, { raw: rawBlockers, normalized: normalizedBlockers, feature: featureBlockers, model: modelBlockers });
    const runById = new Map(input.runs.map((run) => [run.id, run])); const predictionMs = Date.parse(manifest.predictionAt);
    for (const runId of uniqueSorted(manifest.sourceReferences.flatMap((reference) => reference.ingestionRunId ? [reference.ingestionRunId] : []))) {
      const run = runById.get(runId); if (!run) { rawBlockers.add("INGESTION_RUN_MISSING"); continue; }
      if (run.status !== "completed") rawBlockers.add("INGESTION_RUN_INCOMPLETE"); if (!run.snapshotKey || !run.checksumSha256) rawBlockers.add("RAW_SNAPSHOT_REFERENCE_MISSING");
      if (run.rawObjectExists === false) rawBlockers.add("RAW_SNAPSHOT_MISSING"); if (run.rawObjectExists === null) rawBlockers.add("RAW_SNAPSHOT_UNVERIFIED");
      const capturedMs = Date.parse(run.capturedAt ?? ""); if (!Number.isFinite(capturedMs)) rawBlockers.add("SOURCE_CAPTURE_TIME_INVALID"); else if (Number.isFinite(predictionMs) && capturedMs > predictionMs) rawBlockers.add("SOURCE_CAPTURE_AFTER_PREDICTION");
      if (run.legalStatus !== "approved") rawBlockers.add("SOURCE_LICENSE_UNAPPROVED");
    }
    if (manifest.modelVersionId && (!input.model || input.model.id !== manifest.modelVersionId)) modelBlockers.add("MODEL_RECORD_MISSING");
  }
  if (!input.publish) publishBlockers.add("PUBLISH_DECISION_MISSING"); const runsWithObjects = input.runs.filter((run) => run.rawObjectExists === true).length;
  const stages: LineageStage[] = [
    makeStage("raw", rawBlockers, [{ label: "Kaynak run", value: String(input.runs.length) }, { label: "R2 doğrulandı", value: `${runsWithObjects}/${input.runs.length}` }]),
    makeStage("normalized", normalizedBlockers, [{ label: "Hedef fikstür", value: manifest?.normalized.targetFixtureId ?? "—" }, { label: "Kaynak bağı", value: String(manifest?.sourceReferences.length ?? 0) }]),
    makeStage("feature", featureBlockers, [{ label: "Feature SHA", value: shortHash(manifest?.featureFingerprint) }, { label: "Cutoff", value: manifest?.featureCutoffAt ?? "—" }]),
    makeStage("model", modelBlockers, [{ label: "Model", value: input.model?.modelName ?? manifest?.modelCode ?? "—" }, { label: "Sürüm", value: input.model?.versionLabel ?? shortHash(manifest?.modelVersionId) }]),
    makeStage("publish", publishBlockers, [{ label: "Karar", value: input.publish?.threadStatus ?? "—" }, { label: "Tahmin sürümü", value: input.publish ? `v${input.publish.versionNumber}` : "—" }]),
  ];
  const blockerCodes = uniqueBlockers(stages.flatMap((stage) => stage.blockerCodes)); return { status: blockerCodes.length ? "blocked" : "complete", blockerCodes, stages, policy: { researchOnly: true, recommendationEligible: false, rawPayloadExposed: false, missingLinksFailClosed: true } };
}

export function parsePredictionLineageManifest(value: string): PredictionLineageManifest | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed) || parsed.schemaVersion !== DATA_LINEAGE_SCHEMA_VERSION) return null;
    if (!["predictionVersionId", "threadId", "fixtureId", "predictionAt", "featureCutoffAt", "featureFingerprint", "modelCode"].every((key) => typeof parsed[key] === "string")) return null;
    if (!(parsed.modelVersionId === null || typeof parsed.modelVersionId === "string")) return null;
    if (!isRecord(parsed.normalized)) return null;
    const normalized = parsed.normalized;
    if (typeof normalized.targetFixtureId !== "string" || typeof normalized.benchmarkHistoryFingerprint !== "string") return null;
    if (!["homeHistoryFixtureIds", "awayHistoryFixtureIds", "h2hFixtureIds", "selectedOddsSnapshotIds", "lineupSnapshotIds"].every((key) => isStringArray(normalized[key]))) return null;
    if (!(normalized.contextSnapshotId === null || typeof normalized.contextSnapshotId === "string")) return null;
    if (!Array.isArray(parsed.sourceReferences) || !parsed.sourceReferences.every(isSourceReference)) return null;
    if (!Array.isArray(parsed.blockerCodes) || !parsed.blockerCodes.every(isLineageBlockerCode)) return null;
    if (parsed.researchOnly !== true || parsed.recommendationEligible !== false) return null;
    return parsed as PredictionLineageManifest;
  } catch {
    return null;
  }
}
export function canonicalLineageJson(value: unknown): string { if (value === undefined) return "null"; if (Array.isArray(value)) return `[${value.map((item) => canonicalLineageJson(item)).join(",")}]`; if (value && typeof value === "object") { const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)); return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalLineageJson(item)}`).join(",")}}`; } return JSON.stringify(value) ?? "null"; }
function evaluateStructuralBlockers(input: BuildPredictionLineageInput & { normalized: PredictionLineageManifest["normalized"]; sourceReferences: LineageSourceReference[] }) {
  const blockers = new Set<LineageBlockerCode>(); if (!input.sourceReferences.length) blockers.add("SOURCE_REFERENCES_MISSING"); if (input.sourceReferences.some((reference) => !reference.ingestionRunId)) blockers.add("SOURCE_RUN_LINK_MISSING");
  if (!input.sourceReferences.some((r) => r.purpose === "target_fixture" && r.entityId === input.normalized.targetFixtureId && r.ingestionRunId)) blockers.add("TARGET_FIXTURE_SOURCE_MISSING");
  const historyIds = uniqueSorted([...input.normalized.homeHistoryFixtureIds, ...input.normalized.awayHistoryFixtureIds, ...input.normalized.h2hFixtureIds]); if (historyIds.some((id) => !input.sourceReferences.some((r) => r.entityType === "fixture" && r.entityId === id && r.ingestionRunId))) blockers.add("HISTORICAL_SOURCE_LINK_MISSING");
  if (input.normalized.selectedOddsSnapshotIds.some((id) => !input.sourceReferences.some((r) => r.entityType === "odds_snapshot" && r.entityId === id && r.ingestionRunId))) blockers.add("ODDS_SOURCE_LINK_MISSING");
  if (input.normalized.lineupSnapshotIds.some((id) => !input.sourceReferences.some((r) => r.entityType === "lineup_snapshot" && r.entityId === id && r.ingestionRunId))) blockers.add("LINEUP_SOURCE_LINK_MISSING");
  if (input.normalized.contextSnapshotId && !input.sourceReferences.some((r) => r.entityType === "fixture_context_snapshot" && r.entityId === input.normalized.contextSnapshotId && r.ingestionRunId)) blockers.add("CONTEXT_SOURCE_LINK_MISSING");
  const predictionMs = Date.parse(input.predictionAt); const cutoffMs = Date.parse(input.featureCutoffAt); if (!input.featureFingerprint.trim()) blockers.add("FEATURE_FINGERPRINT_MISSING"); if (!Number.isFinite(cutoffMs) || !Number.isFinite(predictionMs)) blockers.add("FEATURE_CUTOFF_INVALID"); else if (cutoffMs > predictionMs) blockers.add("FEATURE_CUTOFF_AFTER_PREDICTION"); if (!nullableIdentifier(input.modelVersionId)) blockers.add("MODEL_VERSION_MISSING"); return uniqueBlockers([...blockers]);
}
function normalizeSourceReferences(references: LineageSourceReference[]) { if (!Array.isArray(references)) throw new Error("Lineage sourceReferences must be an array."); const normalized = references.map((reference) => { requireIdentifier(reference.entityId, "sourceReferences.entityId"); return { ...reference, entityId: reference.entityId.trim(), ingestionRunId: nullableIdentifier(reference.ingestionRunId) }; }); const map = new Map(normalized.map((r) => [[r.purpose, r.entityType, r.entityId, r.ingestionRunId ?? "missing"].join("|"), r])); return [...map.values()].sort((a, b) => a.purpose.localeCompare(b.purpose) || a.entityType.localeCompare(b.entityType) || a.entityId.localeCompare(b.entityId) || (a.ingestionRunId ?? "").localeCompare(b.ingestionRunId ?? "")); }
function stageBlocker(code: LineageBlockerCode, stages: { raw: Set<LineageBlockerCode>; normalized: Set<LineageBlockerCode>; feature: Set<LineageBlockerCode>; model: Set<LineageBlockerCode> }) { if (code.startsWith("SOURCE_") || code.startsWith("INGESTION_") || code.startsWith("RAW_")) stages.raw.add(code); else if (code.startsWith("FEATURE_")) stages.feature.add(code); else if (code.startsWith("MODEL_")) stages.model.add(code); else stages.normalized.add(code); }
function makeStage(id: LineageStage["id"], blockers: Set<LineageBlockerCode>, evidence: LineageStage["evidence"]): LineageStage { const blockerCodes = uniqueBlockers([...blockers]); return { id, status: blockerCodes.length ? "blocked" : "complete", blockerCodes, evidence }; }
function uniqueSorted(values: string[]) { return [...new Set(values.filter((v) => typeof v === "string" && v.trim()).map((v) => v.trim()))].sort((a, b) => a.localeCompare(b)); }
function uniqueBlockers(values: LineageBlockerCode[]) { return [...new Set(values)].sort((a, b) => a.localeCompare(b)); }
function nullableIdentifier(value: string | null | undefined) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function requireIdentifier(value: string, field: string) { if (typeof value !== "string" || !value.trim()) throw new Error(`Lineage ${field} is required.`); }
function shortHash(value: string | null | undefined) { return value ? value.slice(0, 12) : "—"; }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function isStringArray(value: unknown): value is string[] { return Array.isArray(value) && value.every((item) => typeof item === "string"); }
function isSourceReference(value: unknown): value is LineageSourceReference { return isRecord(value) && (LINEAGE_SOURCE_PURPOSES as readonly unknown[]).includes(value.purpose) && (LINEAGE_ENTITY_TYPES as readonly unknown[]).includes(value.entityType) && typeof value.entityId === "string" && (value.ingestionRunId === null || typeof value.ingestionRunId === "string"); }
function isLineageBlockerCode(value: unknown): value is LineageBlockerCode { return (LINEAGE_BLOCKER_CODES as readonly unknown[]).includes(value); }
async function sha256(value: string) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(""); }
