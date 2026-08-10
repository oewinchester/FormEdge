export const MODEL_CARD_SCHEMA_VERSION = "model-version-card-v1" as const;

export type ModelCardStatus = "blocked" | "documented";
export type MetricSet = { sampleCount: number; accuracy: number; logLoss: number; brierScore: number; ece: number };
export type EvidenceModel = {
  modelCode: string;
  status: "blocked" | "insufficient" | "inconclusive" | "candidate";
  calibration: {
    selectedTemperature: number;
    accepted: boolean;
    calibrationRawLogLoss: number;
    calibrationFittedLogLoss: number;
    calibrationGain: number;
  };
  calibratedHoldout: MetricSet;
  logLossVsUniform: { delta: number; lower95: number; upper95: number };
};

export type ModelVersionCardInput = {
  evidenceAsOf: string;
  model: {
    id: string; code: string; displayName: string; family: "heuristic" | "statistical" | "ensemble";
    targetMarket: string; status: "research" | "shadow" | "active" | "suspended"; description: string;
  };
  version: {
    id: string; versionLabel: string; featureSchemaVersion: string; configChecksumSha256: string;
    trainingCutoffAt: string | null; status: "candidate" | "champion" | "retired"; createdAt: string;
  };
  dataset: null | {
    id: string; name: string; status: "building" | "completed" | "failed"; checksumSha256: string;
    featureSchemaVersion: string; eligibleSampleCount: number; averageDataCompleteness: number;
    leakageViolationCount: number; completedAt: string | null;
  };
  backtest: null | {
    id: string; status: "running" | "completed" | "failed"; datasetKind: "historical" | "synthetic";
    datasetChecksumSha256: string; featureDatasetRunId: string | null; leagueLabel: string; market: string;
    evaluationMode: "walk_forward"; sourceSampleCount: number; sampleCount: number; foldCount: number;
    leakageViolationCount: number; dataCompleteness: number; accuracy: number | null; logLoss: number | null;
    brierScore: number | null; ece: number | null; releaseStage: string; completedAt: string | null;
  };
  evidence: null | {
    id: string; status: "running" | "completed" | "failed"; schemaVersion: string; configChecksumSha256: string;
    datasetChecksumSha256: string; researchOnly: boolean;
    evidenceStatus: "blocked" | "insufficient" | "inconclusive" | "candidate";
    developmentCount: number; calibrationCount: number; holdoutCount: number;
    holdoutStartAt: string | null; holdoutEndAt: string | null; model: EvidenceModel | null; completedAt: string | null;
  };
  releaseGate: null | {
    id: string; stage: string; activeModelVersionId: string | null; lastBacktestRunId: string | null;
    automatedRecommendationAllowed: boolean; evidenceSummary: string[]; decidedAt: string;
  };
};

export type ModelVersionCardManifest = {
  schemaVersion: typeof MODEL_CARD_SCHEMA_VERSION;
  evidenceAsOf: string;
  cardStatus: ModelCardStatus;
  identity: ModelVersionCardInput["model"];
  version: ModelVersionCardInput["version"];
  intendedUses: string[];
  prohibitedUses: string[];
  limitations: string[];
  trainingData: {
    datasetRunId: string | null; name: string | null; status: string | null; checksumSha256: string | null;
    featureSchemaVersion: string | null; eligibleSampleCount: number; averageDataCompleteness: number;
    leakageViolationCount: number; completedAt: string | null;
  };
  evaluation: {
    backtestRunId: string | null; datasetKind: string | null; leagueLabel: string | null; market: string;
    evaluationMode: string | null; sourceSampleCount: number; outOfSampleCount: number; foldCount: number;
    leakageViolationCount: number; metrics: Omit<MetricSet, "sampleCount"> | null; evidenceRunId: string | null;
    evidenceSchemaVersion: string | null; evidenceStatus: string | null;
    partition: { developmentCount: number; calibrationCount: number; holdoutCount: number; holdoutStartAt: string | null; holdoutEndAt: string | null };
    calibration: EvidenceModel["calibration"] | null; calibratedHoldout: MetricSet | null;
    uncertainty: EvidenceModel["logLossVsUniform"] | null;
  };
  governance: {
    releaseGateId: string | null; releaseStage: string; releaseEvidenceSummary: string[];
    automatedRecommendationAllowed: false; cardCanOpenReleaseGate: false; cardCanChangeModelStatus: false;
    researchOnly: true; recommendationEligible: false; blockersFailClosed: true;
  };
  blockerCodes: string[];
  warningCodes: string[];
};

const LIMITATIONS: Record<string, string[]> = {
  "form-dominance-baseline": ["Yakın dönem formu veri tamlığı değişimlerine duyarlıdır; nedensellik kanıtı değildir.", "H2H ağırlığı ayrı ablation kanıtı olmadan sıfır kalır ve yüzde 12'yi aşamaz."],
  "elo-baseline": ["Elo takım gücünü tek boyuta indirger; kadro ve taktik değişimlerini açıklamaz.", "Başlangıç puanı ile güncelleme katsayısı yeni takımlarda belirsizlik yaratabilir."],
  "poisson-baseline": ["Bağımsız gol varsayımı ortak maç dinamiklerini eksik temsil edebilir.", "Hücum ve savunma oranları seyrek örneklemde kararsızlaşabilir."],
  "dixon-coles-baseline": ["Düşük skor düzeltmesi kadro, seyahat ve fikstür yoğunluğunu açıklamaz.", "Zaman ağırlığı ve korelasyon parametresi dönem değişiminde yeniden doğrulanmalıdır."],
};

export async function buildModelVersionCard(raw: ModelVersionCardInput) {
  const input = normalize(raw);
  const blockers = new Set<string>();
  const warnings = new Set<string>();
  if (!isSha(input.version.configChecksumSha256)) blockers.add("MODEL_CONFIG_CHECKSUM_MISSING");
  if (!input.version.featureSchemaVersion) blockers.add("FEATURE_SCHEMA_VERSION_MISSING");
  if (!input.version.trainingCutoffAt) warnings.add("TRAINING_CUTOFF_UNDECLARED");

  const backtest = input.backtest;
  if (!backtest) blockers.add("BACKTEST_MISSING");
  else {
    if (backtest.status !== "completed" || !backtest.completedAt) blockers.add("BACKTEST_NOT_COMPLETED");
    if (backtest.datasetKind !== "historical") blockers.add("HISTORICAL_BACKTEST_MISSING");
    if (backtest.evaluationMode !== "walk_forward") blockers.add("WALK_FORWARD_EVALUATION_MISSING");
    if (!backtest.featureDatasetRunId) blockers.add("DATASET_LINK_MISSING");
    if (backtest.sampleCount <= 0 || backtest.foldCount <= 0) blockers.add("OUT_OF_SAMPLE_METRICS_MISSING");
    if (backtest.leakageViolationCount > 0) blockers.add("BACKTEST_LEAKAGE_DETECTED");
    if (!validBacktestMetrics(backtest)) blockers.add("BACKTEST_METRICS_INVALID");
    if (backtest.sampleCount < 400) warnings.add("OUT_OF_SAMPLE_COUNT_BELOW_RELEASE_BASELINE");
    if (backtest.dataCompleteness < 0.9) warnings.add("DATA_COMPLETENESS_BELOW_RELEASE_BASELINE");
    if (typeof backtest.ece === "number" && backtest.ece > 0.08) warnings.add("CALIBRATION_ERROR_ABOVE_RELEASE_BASELINE");
  }

  const dataset = input.dataset;
  if (!dataset) blockers.add("DATASET_MISSING");
  else {
    if (dataset.status !== "completed" || !dataset.completedAt) blockers.add("DATASET_NOT_COMPLETED");
    if (!isSha(dataset.checksumSha256)) blockers.add("DATASET_CHECKSUM_MISSING");
    if (dataset.leakageViolationCount > 0) blockers.add("DATASET_LEAKAGE_DETECTED");
    if (dataset.featureSchemaVersion !== input.version.featureSchemaVersion) blockers.add("FEATURE_SCHEMA_MISMATCH");
    if (backtest && dataset.id !== backtest.featureDatasetRunId) blockers.add("DATASET_LINK_MISMATCH");
    if (backtest && dataset.checksumSha256 !== backtest.datasetChecksumSha256) blockers.add("DATASET_CHECKSUM_MISMATCH");
  }

  const evidence = input.evidence;
  if (!evidence) blockers.add("TEMPORAL_EVIDENCE_MISSING");
  else {
    if (evidence.status !== "completed" || !evidence.completedAt) blockers.add("TEMPORAL_EVIDENCE_NOT_COMPLETED");
    if (!isSha(evidence.configChecksumSha256)) blockers.add("EVIDENCE_CONFIG_CHECKSUM_MISSING");
    if (dataset && evidence.datasetChecksumSha256 !== dataset.checksumSha256) blockers.add("EVIDENCE_DATASET_MISMATCH");
    if (evidence.developmentCount <= 0 || evidence.calibrationCount <= 0 || evidence.holdoutCount <= 0 || !evidence.holdoutStartAt || !evidence.holdoutEndAt) blockers.add("TEMPORAL_PARTITION_INCOMPLETE");
    if (!evidence.model || evidence.model.modelCode !== input.model.code) blockers.add("MODEL_EVIDENCE_MISSING");
    if (evidence.model && (!validMetricSet(evidence.model.calibratedHoldout) || !validCalibration(evidence.model.calibration))) blockers.add("CALIBRATION_EVIDENCE_INVALID");
    if (evidence.researchOnly) warnings.add("EVIDENCE_RESEARCH_ONLY");
    if (evidence.evidenceStatus !== "candidate") warnings.add("EVIDENCE_NOT_CANDIDATE");
  }

  const gate = input.releaseGate;
  if (!gate) blockers.add("RELEASE_GATE_RECORD_MISSING");
  else {
    if (gate.activeModelVersionId !== input.version.id) blockers.add("RELEASE_GATE_MODEL_MISMATCH");
    if (backtest && gate.lastBacktestRunId !== backtest.id) blockers.add("RELEASE_GATE_BACKTEST_MISMATCH");
    if (gate.automatedRecommendationAllowed) blockers.add("AUTOMATED_RECOMMENDATION_GATE_OPEN");
    if (gate.stage === "general_recommendation") blockers.add("GENERAL_RECOMMENDATION_REQUIRES_EXTERNAL_APPROVAL");
  }

  const blockerCodes = [...blockers].sort();
  const warningCodes = [...warnings].sort();
  const manifest: ModelVersionCardManifest = {
    schemaVersion: MODEL_CARD_SCHEMA_VERSION,
    evidenceAsOf: input.evidenceAsOf,
    cardStatus: blockerCodes.length ? "blocked" : "documented",
    identity: input.model,
    version: input.version,
    intendedUses: ["İç araştırmada sürüm bazlı olasılık kalitesi ve kalibrasyon denetimi.", "Walk-forward, zamansal holdout ve shadow kanıtlarının izlenebilir raporlanması.", "Model değişikliklerinin dataset, konfigürasyon ve release gate kanıtıyla incelenmesi."],
    prohibitedUses: ["Kartı tek başına bahis önerisi izni olarak kullanmak.", "Tahmin sonrası veriyle performansı geriye dönük iyileştirmek.", "Release gate, lisans veya ileri-zaman doğrulama engellerini atlamak.", "Kesin sonuç, kazanç garantisi veya finansal tavsiye iddiasında bulunmak."],
    limitations: [...(LIMITATIONS[input.model.code] ?? ["Model ailesine özgü sınırlamalar henüz tanımlanmadı."]), "Model kartı canlı performans garantisi değildir; veri ve davranış kayması ayrı ileri-zaman doğrulama gerektirir.", "Ticari kullanım hakkı ve kaynak revizyon zamanlaması karttan bağımsız dış release kanıtıdır."],
    trainingData: {
      datasetRunId: dataset?.id ?? null, name: dataset?.name ?? null, status: dataset?.status ?? null,
      checksumSha256: dataset?.checksumSha256 ?? null, featureSchemaVersion: dataset?.featureSchemaVersion ?? null,
      eligibleSampleCount: dataset?.eligibleSampleCount ?? 0, averageDataCompleteness: dataset?.averageDataCompleteness ?? 0,
      leakageViolationCount: dataset?.leakageViolationCount ?? 0, completedAt: dataset?.completedAt ?? null,
    },
    evaluation: {
      backtestRunId: backtest?.id ?? null, datasetKind: backtest?.datasetKind ?? null, leagueLabel: backtest?.leagueLabel ?? null,
      market: backtest?.market ?? input.model.targetMarket, evaluationMode: backtest?.evaluationMode ?? null,
      sourceSampleCount: backtest?.sourceSampleCount ?? 0, outOfSampleCount: backtest?.sampleCount ?? 0,
      foldCount: backtest?.foldCount ?? 0, leakageViolationCount: backtest?.leakageViolationCount ?? 0,
      metrics: backtest && validBacktestMetrics(backtest) ? { accuracy: backtest.accuracy!, logLoss: backtest.logLoss!, brierScore: backtest.brierScore!, ece: backtest.ece! } : null,
      evidenceRunId: evidence?.id ?? null, evidenceSchemaVersion: evidence?.schemaVersion ?? null,
      evidenceStatus: evidence?.evidenceStatus ?? null,
      partition: { developmentCount: evidence?.developmentCount ?? 0, calibrationCount: evidence?.calibrationCount ?? 0, holdoutCount: evidence?.holdoutCount ?? 0, holdoutStartAt: evidence?.holdoutStartAt ?? null, holdoutEndAt: evidence?.holdoutEndAt ?? null },
      calibration: evidence?.model?.calibration ?? null, calibratedHoldout: evidence?.model?.calibratedHoldout ?? null,
      uncertainty: evidence?.model?.logLossVsUniform ?? null,
    },
    governance: {
      releaseGateId: gate?.id ?? null, releaseStage: gate?.stage ?? "unrecorded", releaseEvidenceSummary: gate?.evidenceSummary ?? [],
      automatedRecommendationAllowed: false, cardCanOpenReleaseGate: false, cardCanChangeModelStatus: false,
      researchOnly: true, recommendationEligible: false, blockersFailClosed: true,
    },
    blockerCodes,
    warningCodes,
  };
  return { manifest, evidenceFingerprintSha256: await sha256(canonicalModelCardJson(manifest)) };
}

export function parseModelVersionCardManifest(value: string): ModelVersionCardManifest | null {
  try {
    const card = JSON.parse(value) as Partial<ModelVersionCardManifest>;
    if (card.schemaVersion !== MODEL_CARD_SCHEMA_VERSION || (card.cardStatus !== "blocked" && card.cardStatus !== "documented")
      || !card.identity || !card.version || !card.trainingData || !card.evaluation || !card.governance
      || !Array.isArray(card.blockerCodes) || !Array.isArray(card.warningCodes) || !Array.isArray(card.intendedUses)
      || !Array.isArray(card.prohibitedUses) || !Array.isArray(card.limitations)
      || card.governance.automatedRecommendationAllowed !== false || card.governance.cardCanOpenReleaseGate !== false
      || card.governance.cardCanChangeModelStatus !== false || card.governance.researchOnly !== true
      || card.governance.recommendationEligible !== false || card.governance.blockersFailClosed !== true) return null;
    return card as ModelVersionCardManifest;
  } catch { return null; }
}

export function canonicalModelCardJson(value: unknown): string {
  if (value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicalModelCardJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalModelCardJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function normalize(input: ModelVersionCardInput): ModelVersionCardInput {
  return { ...input, evidenceAsOf: new Date(input.evidenceAsOf).toISOString(), model: { ...input.model, id: input.model.id.trim(), code: input.model.code.trim(), displayName: input.model.displayName.trim(), targetMarket: input.model.targetMarket.trim(), description: input.model.description.trim() }, version: { ...input.version, id: input.version.id.trim(), versionLabel: input.version.versionLabel.trim(), featureSchemaVersion: input.version.featureSchemaVersion.trim(), configChecksumSha256: input.version.configChecksumSha256.trim().toLowerCase() } };
}
function validBacktestMetrics(value: NonNullable<ModelVersionCardInput["backtest"]>) {
  return typeof value.accuracy === "number" && value.accuracy >= 0 && value.accuracy <= 1
    && typeof value.logLoss === "number" && Number.isFinite(value.logLoss) && value.logLoss >= 0
    && typeof value.brierScore === "number" && value.brierScore >= 0 && value.brierScore <= 1
    && typeof value.ece === "number" && value.ece >= 0 && value.ece <= 1;
}
function validMetricSet(value?: MetricSet | null) {
  return Boolean(value) && Number.isInteger(value!.sampleCount) && value!.sampleCount > 0
    && value!.accuracy >= 0 && value!.accuracy <= 1
    && Number.isFinite(value!.logLoss) && value!.logLoss >= 0
    && value!.brierScore >= 0 && value!.brierScore <= 1
    && value!.ece >= 0 && value!.ece <= 1;
}
function validCalibration(value?: EvidenceModel["calibration"] | null) {
  return Boolean(value) && [value!.selectedTemperature, value!.calibrationRawLogLoss, value!.calibrationFittedLogLoss, value!.calibrationGain].every(Number.isFinite)
    && value!.selectedTemperature >= 0.25 && value!.selectedTemperature <= 5
    && value!.calibrationRawLogLoss >= 0 && value!.calibrationFittedLogLoss >= 0;
}
function isSha(value: string) { return /^[a-f0-9]{64}$/.test(value); }
async function sha256(value: string) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
