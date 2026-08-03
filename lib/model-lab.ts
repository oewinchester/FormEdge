export type MatchOutcome = "1" | "X" | "2";
export type Venue = "home" | "away";
export type ReleaseStage =
  | "research"
  | "analysis_only"
  | "shadow"
  | "limited_recommendation"
  | "general_recommendation"
  | "suspended";

export type ProbabilityTriple = {
  home: number;
  draw: number;
  away: number;
};

export type HistoricalMatch = {
  fixtureId: string;
  kickoffAt: string;
  resultKnownAt?: string;
  venue: Venue;
  result: "win" | "draw" | "loss";
  goalsFor: number;
  goalsAgainst: number;
  opponentStrength?: number;
  expectedGoalsFor?: number;
  expectedGoalsAgainst?: number;
  shotsFor?: number;
  shotsAgainst?: number;
  shotsOnTargetFor?: number;
  shotsOnTargetAgainst?: number;
  possessionFor?: number;
  possessionAgainst?: number;
  dangerousAttacksFor?: number;
  dangerousAttacksAgainst?: number;
  penaltyAreaEntriesFor?: number;
  penaltyAreaEntriesAgainst?: number;
  ppdaFor?: number;
  ppdaAgainst?: number;
  bigChancesCreated?: number;
  bigChancesAllowed?: number;
};

export type FormModelConfig = {
  lastFiveWeight: number;
  lastTenWeight: number;
  momentumWeight: number;
  resultWeight: number;
  dominanceWeight: number;
  scoreControlWeight: number;
  recencyHalfLifeMatches: number;
  venueMatchMultiplier: number;
  h2hWeight: number;
  homeAdvantageLogit: number;
  formLogitScale: number;
  drawBaseLogit: number;
  drawSuppressionScale: number;
};

export type TeamFormScore = {
  score: number;
  lastFive: number;
  lastTen: number;
  momentum: number;
  resultScore: number;
  dominanceScore: number;
  advancedDataCoverage: number;
  sampleCount: number;
};

export type FormAdvantageInput = {
  predictionAt: string;
  homeTeamId: string;
  awayTeamId: string;
  homeHistory: HistoricalMatch[];
  awayHistory: HistoricalMatch[];
  h2hFromHomePerspective?: HistoricalMatch[];
  config?: Partial<FormModelConfig>;
};

export type FormAdvantageFeatures = {
  featureSchemaVersion: typeof FEATURE_SCHEMA_VERSION;
  predictionAt: string;
  homeTeamId: string;
  awayTeamId: string;
  home: TeamFormScore;
  away: TeamFormScore;
  rawFormDifference: number;
  h2hSignal: number;
  h2hContribution: number;
  adjustedFormDifference: number;
  probabilities: ProbabilityTriple;
};

export type MarketOdds = {
  home: number;
  draw: number;
  away: number;
  capturedAt: string;
  closingHome?: number;
  closingDraw?: number;
  closingAway?: number;
};

export type BacktestSample = {
  fixtureId: string;
  predictionAt: string;
  kickoffAt: string;
  featureCutoffAt: string;
  resultKnownAt?: string;
  actualOutcome: MatchOutcome;
  probabilities: ProbabilityTriple;
  odds?: MarketOdds;
  dataCompleteness: number;
  featureFingerprint: string;
};

export type BacktestConfig = {
  minOdds: number;
  minEdge: number;
  minTopProbability: number;
  minRecommendationDataCompleteness: number;
  kellyMultiplier: number;
  maxStakeFraction: number;
  minTrainSize: number;
  testSize: number;
  stepSize: number;
  embargoHours: number;
  calibrationBins: number;
};

export type PointInTimeViolation = {
  fixtureId: string;
  code:
    | "INVALID_TIMESTAMP"
    | "PREDICTION_NOT_BEFORE_KICKOFF"
    | "FEATURE_AFTER_PREDICTION"
    | "ODDS_AFTER_PREDICTION"
    | "INVALID_RESULT_TIMESTAMP"
    | "INVALID_OUTCOME"
    | "INVALID_PROBABILITIES"
    | "INVALID_ODDS"
    | "INVALID_DATA_COMPLETENESS"
    | "INVALID_SAMPLE_IDENTITY"
    | "DUPLICATE_FIXTURE";
  message: string;
};

export type EvaluatedPrediction = BacktestSample & {
  predictedOutcome: MatchOutcome;
  correct: boolean;
  selectedOutcome: MatchOutcome | null;
  selectedProbability: number | null;
  decimalOdds: number | null;
  closingOdds: number | null;
  edge: number | null;
  stakeUnits: number;
  pnlUnits: number;
  clv: number | null;
};

export type WalkForwardFold = {
  index: number;
  trainCount: number;
  testCount: number;
  trainStartAt: string;
  trainEndAt: string;
  testStartAt: string;
  testEndAt: string;
  testFixtureIds: string[];
};

export type BacktestMetrics = {
  sampleCount: number;
  foldCount: number;
  accuracy: number;
  logLoss: number;
  brierScore: number;
  ece: number;
  calibrationSlope: number | null;
  calibrationIntercept: number | null;
  benchmarkLogLoss: number;
  benchmarkBrierScore: number;
  recommendationCount: number;
  recommendationHitRate: number | null;
  totalStakeUnits: number;
  netUnits: number;
  yield: number | null;
  profitFactor: number | null;
  averageClv: number | null;
  maxDrawdownUnits: number;
  maxLosingStreak: number;
  dataCompleteness: number;
  consistentPeriods: number;
};

export type ReleaseCriterion = {
  key: string;
  label: string;
  passed: boolean;
  actual: number | string;
  target: number | string;
};

export type ReleaseDecision = {
  stage: ReleaseStage;
  automatedRecommendationAllowed: boolean;
  reasons: string[];
  criteria: ReleaseCriterion[];
};

export type BacktestResult = {
  sourceSampleCount: number;
  config: BacktestConfig;
  metrics: BacktestMetrics;
  folds: WalkForwardFold[];
  predictions: EvaluatedPrediction[];
  releaseDecision: ReleaseDecision;
};

export const FEATURE_SCHEMA_VERSION = "form-dominance-v1" as const;

export const defaultFormModelConfig: FormModelConfig = {
  lastFiveWeight: 0.66,
  lastTenWeight: 0.26,
  momentumWeight: 0.08,
  resultWeight: 0.52,
  dominanceWeight: 0.38,
  scoreControlWeight: 0.10,
  recencyHalfLifeMatches: 3.5,
  venueMatchMultiplier: 1.12,
  h2hWeight: 0,
  homeAdvantageLogit: 0.24,
  formLogitScale: 19,
  drawBaseLogit: 0.18,
  drawSuppressionScale: 23,
};

export const defaultBacktestConfig: BacktestConfig = {
  minOdds: 1.2,
  minEdge: 0.05,
  minTopProbability: 0.5,
  minRecommendationDataCompleteness: 0.85,
  kellyMultiplier: 0.25,
  maxStakeFraction: 0.02,
  minTrainSize: 60,
  testSize: 24,
  stepSize: 24,
  embargoHours: 6,
  calibrationBins: 10,
};

export class ModelLabValidationError extends Error {
  readonly violations: PointInTimeViolation[];

  constructor(message: string, violations: PointInTimeViolation[] = []) {
    super(message);
    this.name = "ModelLabValidationError";
    this.violations = violations;
  }
}

export function buildFormAdvantageFeatures(input: FormAdvantageInput): FormAdvantageFeatures {
  const config = normalizeFormConfig(input.config);
  const predictionAt = validDateMs(input.predictionAt, "predictionAt");
  const home = scoreTeamForm(input.homeHistory, predictionAt, "home", config);
  const away = scoreTeamForm(input.awayHistory, predictionAt, "away", config);
  const rawFormDifference = home.score - away.score;
  const h2hRows = input.h2hFromHomePerspective ?? [];
  const h2hSignal = h2hRows.length
    ? scoreTeamForm(h2hRows, predictionAt, "home", config).score
    : 50;
  const h2hWeight = clamp(config.h2hWeight, 0, 0.12);
  const centeredH2h = clamp((h2hSignal - 50) * 2, -100, 100);
  const h2hContribution = centeredH2h * h2hWeight;
  const adjustedFormDifference = rawFormDifference * (1 - h2hWeight) + h2hContribution;

  return {
    featureSchemaVersion: FEATURE_SCHEMA_VERSION,
    predictionAt: new Date(predictionAt).toISOString(),
    homeTeamId: input.homeTeamId,
    awayTeamId: input.awayTeamId,
    home,
    away,
    rawFormDifference: round(rawFormDifference, 4),
    h2hSignal: round(h2hSignal, 4),
    h2hContribution: round(h2hContribution, 4),
    adjustedFormDifference: round(adjustedFormDifference, 4),
    probabilities: formDifferenceToProbabilities(adjustedFormDifference, config),
  };
}

export function scoreTeamForm(
  history: HistoricalMatch[],
  predictionAtMs: number,
  upcomingVenue: Venue,
  config: FormModelConfig = defaultFormModelConfig,
): TeamFormScore {
  if (!Array.isArray(history) || history.length === 0) {
    throw new ModelLabValidationError("At least one historical match is required for each team.");
  }

  const ordered = history.map((row) => {
    const kickoff = validDateMs(row.kickoffAt, `history.${row.fixtureId}.kickoffAt`);
    const resultKnownAt = row.resultKnownAt
      ? validDateMs(row.resultKnownAt, `history.${row.fixtureId}.resultKnownAt`)
      : kickoff + 3 * 3_600_000;
    if (resultKnownAt < kickoff) {
      throw new ModelLabValidationError(`Historical fixture ${row.fixtureId} has an invalid result timestamp.`);
    }
    if (resultKnownAt > predictionAtMs) {
      throw new ModelLabValidationError(
        `Historical fixture ${row.fixtureId} is not available at prediction time.`,
        [{
          fixtureId: row.fixtureId,
          code: "FEATURE_AFTER_PREDICTION",
          message: "Historical results and features must be available no later than predictionAt.",
        }],
      );
    }
    return { row, kickoff };
  }).sort((a, b) => b.kickoff - a.kickoff).slice(0, 10);

  const scored = ordered.map(({ row }, index) => {
    const resultScore = row.result === "win" ? 1 : row.result === "draw" ? 0.42 : 0;
    const dominance = dominanceForMatch(row);
    const goalDifference = clamp(row.goalsFor - row.goalsAgainst, -4, 4);
    const scoreControl = 0.5 + Math.tanh(goalDifference / 2.2) / 2;
    const raw = config.resultWeight * resultScore
      + config.dominanceWeight * dominance.score
      + config.scoreControlWeight * scoreControl;
    const strength = clamp(row.opponentStrength ?? 0.5, 0, 1);
    const adjusted = clamp(0.5 + (raw - 0.5) * (0.82 + strength * 0.36), 0, 1);
    const recency = Math.exp((-Math.LN2 * index) / Math.max(config.recencyHalfLifeMatches, 0.5));
    const venue = row.venue === upcomingVenue ? config.venueMatchMultiplier : 1;
    return {
      value: adjusted,
      resultScore,
      dominanceScore: dominance.score,
      coverage: dominance.coverage,
      weight: recency * venue,
    };
  });

  const lastFiveRows = scored.slice(0, 5);
  const lastTenRows = scored.slice(0, 10);
  const lastFive = weightedAverage(lastFiveRows.map((row) => [row.value, row.weight]));
  const lastTen = weightedAverage(lastTenRows.map((row) => [row.value, row.weight]));
  const recentThree = weightedAverage(scored.slice(0, 3).map((row) => [row.value, row.weight]));
  const previousThreeRows = scored.slice(3, 6);
  const previousThree = previousThreeRows.length
    ? weightedAverage(previousThreeRows.map((row) => [row.value, row.weight]))
    : recentThree;
  const momentum = clamp(0.5 + (recentThree - previousThree), 0, 1);
  const score = 100 * (
    config.lastFiveWeight * lastFive
    + config.lastTenWeight * lastTen
    + config.momentumWeight * momentum
  );

  return {
    score: round(score, 4),
    lastFive: round(lastFive * 100, 4),
    lastTen: round(lastTen * 100, 4),
    momentum: round(momentum * 100, 4),
    resultScore: round(weightedAverage(scored.map((row) => [row.resultScore, row.weight])) * 100, 4),
    dominanceScore: round(weightedAverage(scored.map((row) => [row.dominanceScore, row.weight])) * 100, 4),
    advancedDataCoverage: round(weightedAverage(scored.map((row) => [row.coverage, row.weight])), 4),
    sampleCount: scored.length,
  };
}

export function formDifferenceToProbabilities(
  formDifference: number,
  config: FormModelConfig = defaultFormModelConfig,
): ProbabilityTriple {
  const formLogit = clamp(formDifference / Math.max(config.formLogitScale, 1), -4, 4);
  const logits = [
    config.homeAdvantageLogit + formLogit,
    config.drawBaseLogit - Math.abs(formDifference) / Math.max(config.drawSuppressionScale, 1),
    -formLogit,
  ];
  const maximum = Math.max(...logits);
  const exponentials = logits.map((value) => Math.exp(value - maximum));
  const total = exponentials.reduce((sum, value) => sum + value, 0);
  return {
    home: round(exponentials[0] / total, 8),
    draw: round(exponentials[1] / total, 8),
    away: round(exponentials[2] / total, 8),
  };
}

export function calculateKellyFraction(
  probability: number,
  decimalOdds: number,
  multiplier = 0.25,
  cap = 0.02,
) {
  if (!Number.isFinite(probability) || probability <= 0 || probability >= 1) return 0;
  if (!Number.isFinite(decimalOdds) || decimalOdds <= 1) return 0;
  const b = decimalOdds - 1;
  const q = 1 - probability;
  const fullKelly = (b * probability - q) / b;
  return round(clamp(fullKelly * multiplier, 0, cap), 8);
}

export function auditPointInTimeSamples(samples: BacktestSample[]): PointInTimeViolation[] {
  const issues: PointInTimeViolation[] = [];
  const seen = new Set<string>();

  for (const sample of samples) {
    if (typeof sample.fixtureId !== "string" || !sample.fixtureId.trim()
      || typeof sample.featureFingerprint !== "string" || !sample.featureFingerprint.trim()) {
      issues.push({ fixtureId: sample.fixtureId || "unknown", code: "INVALID_SAMPLE_IDENTITY", message: "fixtureId and featureFingerprint are required." });
    }
    if (seen.has(sample.fixtureId)) {
      issues.push({ fixtureId: sample.fixtureId, code: "DUPLICATE_FIXTURE", message: "Each fixture may appear only once in one evaluation set." });
    }
    seen.add(sample.fixtureId);

    const predictionAt = safeDateMs(sample.predictionAt);
    const kickoffAt = safeDateMs(sample.kickoffAt);
    const featureCutoffAt = safeDateMs(sample.featureCutoffAt);
    if (predictionAt === null || kickoffAt === null || featureCutoffAt === null) {
      issues.push({ fixtureId: sample.fixtureId, code: "INVALID_TIMESTAMP", message: "predictionAt, kickoffAt and featureCutoffAt must be valid ISO timestamps." });
      continue;
    }
    if (predictionAt >= kickoffAt) {
      issues.push({ fixtureId: sample.fixtureId, code: "PREDICTION_NOT_BEFORE_KICKOFF", message: "Prediction must be frozen before kickoff." });
    }
    if (featureCutoffAt > predictionAt) {
      issues.push({ fixtureId: sample.fixtureId, code: "FEATURE_AFTER_PREDICTION", message: "Feature cutoff cannot be later than predictionAt." });
    }
    if (sample.resultKnownAt !== undefined) {
      const resultKnownAt = safeDateMs(sample.resultKnownAt);
      if (resultKnownAt === null || resultKnownAt < kickoffAt) {
        issues.push({ fixtureId: sample.fixtureId, code: "INVALID_RESULT_TIMESTAMP", message: "resultKnownAt must be a valid timestamp at or after kickoff." });
      }
    }
    if (!(["1", "X", "2"] as unknown[]).includes(sample.actualOutcome)) {
      issues.push({ fixtureId: sample.fixtureId, code: "INVALID_OUTCOME", message: "actualOutcome must be 1, X or 2." });
    }
    if (!validProbabilities(sample.probabilities)) {
      issues.push({ fixtureId: sample.fixtureId, code: "INVALID_PROBABILITIES", message: "1-X-2 probabilities must be finite, positive and sum to one." });
    }
    if (!Number.isFinite(sample.dataCompleteness) || sample.dataCompleteness < 0 || sample.dataCompleteness > 1) {
      issues.push({ fixtureId: sample.fixtureId, code: "INVALID_DATA_COMPLETENESS", message: "dataCompleteness must be between zero and one." });
    }
    if (sample.odds) {
      const oddsAt = safeDateMs(sample.odds.capturedAt);
      if (oddsAt === null || oddsAt > predictionAt) {
        issues.push({ fixtureId: sample.fixtureId, code: "ODDS_AFTER_PREDICTION", message: "Only odds captured at or before predictionAt may be used." });
      }
      const offered = [sample.odds.home, sample.odds.draw, sample.odds.away];
      const closing = [sample.odds.closingHome, sample.odds.closingDraw, sample.odds.closingAway]
        .filter((odd): odd is number => odd !== undefined);
      if ([...offered, ...closing].some((odd) => !Number.isFinite(odd) || odd <= 1)) {
        issues.push({ fixtureId: sample.fixtureId, code: "INVALID_ODDS", message: "Decimal odds must be greater than 1.00." });
      }
    }
  }

  return issues;
}

export function createWalkForwardFolds(
  samples: BacktestSample[],
  partial: Partial<BacktestConfig> = {},
): WalkForwardFold[] {
  const config = normalizeBacktestConfig(partial);
  const ordered = [...samples].sort((a, b) => validDateMs(a.kickoffAt, "kickoffAt") - validDateMs(b.kickoffAt, "kickoffAt"));
  const folds: WalkForwardFold[] = [];
  const embargoMs = config.embargoHours * 3_600_000;

  for (let testStart = config.minTrainSize; testStart < ordered.length; testStart += config.stepSize) {
    const test = ordered.slice(testStart, testStart + config.testSize);
    if (test.length === 0) break;
    const testStartMs = validDateMs(test[0].kickoffAt, "test.kickoffAt");
    const train = ordered.slice(0, testStart).filter((sample) => {
      const knownAt = sample.resultKnownAt
        ? validDateMs(sample.resultKnownAt, "resultKnownAt")
        : validDateMs(sample.kickoffAt, "kickoffAt") + 3 * 3_600_000;
      return knownAt <= testStartMs - embargoMs;
    });
    if (train.length < Math.max(20, Math.floor(config.minTrainSize * 0.65))) continue;
    folds.push({
      index: folds.length + 1,
      trainCount: train.length,
      testCount: test.length,
      trainStartAt: train[0].kickoffAt,
      trainEndAt: train[train.length - 1].kickoffAt,
      testStartAt: test[0].kickoffAt,
      testEndAt: test[test.length - 1].kickoffAt,
      testFixtureIds: test.map((sample) => sample.fixtureId),
    });
  }
  return folds;
}

export function runBacktest(
  samples: BacktestSample[],
  options: {
    config?: Partial<BacktestConfig>;
    datasetKind?: "historical" | "synthetic";
  } = {},
): BacktestResult {
  if (!Array.isArray(samples) || samples.length < 20) {
    throw new ModelLabValidationError("A backtest requires at least 20 chronological samples.");
  }
  if (samples.length > 5_000) {
    throw new ModelLabValidationError("One beta backtest run is limited to 5,000 samples.");
  }
  const violations = auditPointInTimeSamples(samples);
  if (violations.length) {
    throw new ModelLabValidationError("Point-in-time audit failed; the run was rejected.", violations);
  }

  const config = normalizeBacktestConfig(options.config);
  const ordered = [...samples].sort((a, b) => validDateMs(a.kickoffAt, "kickoffAt") - validDateMs(b.kickoffAt, "kickoffAt"));
  const folds = createWalkForwardFolds(ordered, config);
  if (!folds.length) {
    throw new ModelLabValidationError("No valid out-of-sample walk-forward fold could be formed with this configuration.");
  }
  const evaluationIds = new Set(folds.flatMap((fold) => fold.testFixtureIds));
  const predictions = ordered
    .filter((sample) => evaluationIds.has(sample.fixtureId))
    .map((sample) => evaluatePrediction(sample, config));
  const metrics = calculateMetrics(predictions, folds, config);
  const releaseDecision = evaluateReleaseDecision(metrics, options.datasetKind ?? "historical", 0);
  return { sourceSampleCount: ordered.length, config, metrics, folds, predictions, releaseDecision };
}

export function evaluateReleaseDecision(
  metrics: BacktestMetrics,
  datasetKind: "historical" | "synthetic",
  leakageViolations: number,
): ReleaseDecision {
  const criteria: ReleaseCriterion[] = [
    { key: "leakage", label: "Point-in-time ihlali", passed: leakageViolations === 0, actual: leakageViolations, target: 0 },
    { key: "sample", label: "Etkili örnek", passed: metrics.sampleCount >= 400, actual: metrics.sampleCount, target: ">= 400" },
    { key: "folds", label: "Walk-forward dönem", passed: metrics.foldCount >= 3, actual: metrics.foldCount, target: ">= 3" },
    { key: "completeness", label: "Veri tamlığı", passed: metrics.dataCompleteness >= 0.9, actual: round(metrics.dataCompleteness * 100, 1), target: ">= 90%" },
    { key: "log_loss", label: "Naif modele karşı log loss", passed: metrics.logLoss <= metrics.benchmarkLogLoss - 0.01, actual: metrics.logLoss, target: `<= ${round(metrics.benchmarkLogLoss - 0.01, 4)}` },
    { key: "brier", label: "Naif modele karşı Brier", passed: metrics.brierScore <= metrics.benchmarkBrierScore - 0.01, actual: metrics.brierScore, target: `<= ${round(metrics.benchmarkBrierScore - 0.01, 4)}` },
    { key: "ece", label: "Kalibrasyon hatası", passed: metrics.ece <= 0.08, actual: metrics.ece, target: "<= 0.08" },
    { key: "periods", label: "Tutarlı zaman dilimi", passed: metrics.consistentPeriods >= 2, actual: metrics.consistentPeriods, target: ">= 2" },
  ];

  if (datasetKind === "synthetic") {
    return {
      stage: "research",
      automatedRecommendationAllowed: false,
      reasons: ["Sentetik QA verisi model yayın aşamasını yükseltemez."],
      criteria,
    };
  }
  if (leakageViolations > 0) {
    return { stage: "suspended", automatedRecommendationAllowed: false, reasons: ["Point-in-time veri ihlali bulundu."], criteria };
  }
  if (metrics.sampleCount < 120) {
    return { stage: "research", automatedRecommendationAllowed: false, reasons: ["Örnek hacmi araştırma eşiğinin altında."], criteria };
  }
  if (metrics.sampleCount < 400 || metrics.dataCompleteness < 0.9) {
    return { stage: "analysis_only", automatedRecommendationAllowed: false, reasons: ["Analiz gösterilebilir; öneri için örnek ve veri tamlığı yetersiz."], criteria };
  }
  const corePassed = criteria.filter((item) => ["folds", "log_loss", "brier", "ece", "periods"].includes(item.key)).every((item) => item.passed);
  if (!corePassed) {
    return { stage: "shadow", automatedRecommendationAllowed: false, reasons: ["Model canlıdan bağımsız gölge ölçümde kalmalı."], criteria };
  }
  if (metrics.sampleCount >= 800 && metrics.ece <= 0.06 && metrics.maxDrawdownUnits <= 20) {
    return {
      stage: "limited_recommendation",
      automatedRecommendationAllowed: true,
      reasons: ["Sınırlı öneri için otomatik kapılar geçti; genel yayın ayrıca yönetici kararı gerektirir."],
      criteria,
    };
  }
  return { stage: "shadow", automatedRecommendationAllowed: false, reasons: ["Temel kapılar geçti; daha geniş örnek ve gölge dönem gerekli."], criteria };
}

export function createSyntheticBacktestSamples(count = 180): BacktestSample[] {
  const size = Math.max(20, Math.min(500, Math.floor(count)));
  let state = 0x5f3759df;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4_294_967_296;
  };
  const start = Date.UTC(2024, 0, 2, 18, 0, 0);
  const baseline = { home: 0.44, draw: 0.28, away: 0.28 };

  return Array.from({ length: size }, (_, index) => {
    const kickoff = start + index * 31 * 3_600_000;
    const signal = Math.sin(index * 0.63) * 0.13 + (random() - 0.5) * 0.08;
    const drawPulse = Math.cos(index * 0.41) * 0.035;
    const probabilities = normalizeProbabilities({
      home: 0.44 + signal - drawPulse / 2,
      draw: 0.28 + drawPulse,
      away: 0.28 - signal - drawPulse / 2,
    });
    const outcomeRoll = random();
    const actualOutcome: MatchOutcome = outcomeRoll < probabilities.home
      ? "1"
      : outcomeRoll < probabilities.home + probabilities.draw ? "X" : "2";
    const market = normalizeProbabilities({
      home: probabilities.home * 0.7 + baseline.home * 0.3,
      draw: probabilities.draw * 0.7 + baseline.draw * 0.3,
      away: probabilities.away * 0.7 + baseline.away * 0.3,
    });
    const margin = 1.055;
    return {
      fixtureId: `synthetic-${String(index + 1).padStart(4, "0")}`,
      predictionAt: new Date(kickoff - 48 * 3_600_000).toISOString(),
      kickoffAt: new Date(kickoff).toISOString(),
      featureCutoffAt: new Date(kickoff - 49 * 3_600_000).toISOString(),
      resultKnownAt: new Date(kickoff + 3 * 3_600_000).toISOString(),
      actualOutcome,
      probabilities,
      odds: {
        home: round(1 / (market.home * margin), 4),
        draw: round(1 / (market.draw * margin), 4),
        away: round(1 / (market.away * margin), 4),
        capturedAt: new Date(kickoff - 50 * 3_600_000).toISOString(),
        closingHome: round(1 / (probabilities.home * 1.035), 4),
        closingDraw: round(1 / (probabilities.draw * 1.035), 4),
        closingAway: round(1 / (probabilities.away * 1.035), 4),
      },
      dataCompleteness: 1,
      featureFingerprint: `${FEATURE_SCHEMA_VERSION}:synthetic:${index + 1}`,
    };
  });
}

function dominanceForMatch(row: HistoricalMatch) {
  const parts: Array<[number, number]> = [];
  pushDifference(parts, row.expectedGoalsFor, row.expectedGoalsAgainst, 1.5, 1.4);
  pushDifference(parts, row.shotsOnTargetFor, row.shotsOnTargetAgainst, 5, 1.1);
  pushDifference(parts, row.shotsFor, row.shotsAgainst, 11, 0.75);
  pushDifference(parts, row.possessionFor, row.possessionAgainst, 24, 0.45);
  pushDifference(parts, row.dangerousAttacksFor, row.dangerousAttacksAgainst, 42, 0.65);
  pushDifference(parts, row.penaltyAreaEntriesFor, row.penaltyAreaEntriesAgainst, 24, 0.8);
  if (isFiniteNumber(row.ppdaFor) && isFiniteNumber(row.ppdaAgainst)) {
    parts.push([Math.tanh((row.ppdaAgainst - row.ppdaFor) / 7), 0.55]);
  }
  if (isFiniteNumber(row.bigChancesCreated) && isFiniteNumber(row.bigChancesAllowed)) {
    parts.push([Math.tanh((row.bigChancesCreated - row.bigChancesAllowed) / 3), 0.85]);
  }
  if (!parts.length) return { score: 0.5, coverage: 0 };
  const weighted = parts.reduce((sum, [value, weight]) => sum + value * weight, 0);
  const weight = parts.reduce((sum, [, itemWeight]) => sum + itemWeight, 0);
  return { score: clamp(0.5 + (weighted / weight) / 2, 0, 1), coverage: parts.length / 8 };
}

function pushDifference(
  parts: Array<[number, number]>,
  first: number | undefined,
  second: number | undefined,
  scale: number,
  weight: number,
) {
  if (isFiniteNumber(first) && isFiniteNumber(second)) parts.push([Math.tanh((first - second) / scale), weight]);
}

function evaluatePrediction(sample: BacktestSample, config: BacktestConfig): EvaluatedPrediction {
  const predictedOutcome = maxOutcome(sample.probabilities);
  const correct = predictedOutcome === sample.actualOutcome;
  if (!sample.odds) {
    return { ...sample, predictedOutcome, correct, selectedOutcome: null, selectedProbability: null, decimalOdds: null, closingOdds: null, edge: null, stakeUnits: 0, pnlUnits: 0, clv: null };
  }

  const selectedProbability = probabilityFor(sample.probabilities, predictedOutcome);
  const decimalOdds = oddsFor(sample.odds, predictedOutcome);
  const closingOdds = closingOddsFor(sample.odds, predictedOutcome);
  const fairMarket = removeMargin(sample.odds);
  const edge = selectedProbability - probabilityFor(fairMarket, predictedOutcome);
  const eligible = decimalOdds >= config.minOdds
    && selectedProbability >= config.minTopProbability
    && edge >= config.minEdge
    && sample.dataCompleteness >= config.minRecommendationDataCompleteness;
  if (!eligible) {
    return { ...sample, predictedOutcome, correct, selectedOutcome: null, selectedProbability: null, decimalOdds: null, closingOdds: null, edge: round(edge, 8), stakeUnits: 0, pnlUnits: 0, clv: null };
  }

  const stakeFraction = calculateKellyFraction(selectedProbability, decimalOdds, config.kellyMultiplier, config.maxStakeFraction);
  const stakeUnits = round(stakeFraction * 100, 6);
  const won = predictedOutcome === sample.actualOutcome;
  const pnlUnits = round(won ? stakeUnits * (decimalOdds - 1) : -stakeUnits, 6);
  const clv = closingOdds && closingOdds > 1 ? round(decimalOdds / closingOdds - 1, 8) : null;
  return {
    ...sample,
    predictedOutcome,
    correct,
    selectedOutcome: predictedOutcome,
    selectedProbability,
    decimalOdds,
    closingOdds,
    edge: round(edge, 8),
    stakeUnits,
    pnlUnits,
    clv,
  };
}

function calculateMetrics(predictions: EvaluatedPrediction[], folds: WalkForwardFold[], config: BacktestConfig): BacktestMetrics {
  const epsilon = 1e-12;
  const sampleCount = predictions.length;
  const accuracy = predictions.filter((row) => row.correct).length / sampleCount;
  const logLoss = predictions.reduce((sum, row) => sum - Math.log(Math.max(probabilityFor(row.probabilities, row.actualOutcome), epsilon)), 0) / sampleCount;
  const brierScore = predictions.reduce((sum, row) => {
    return sum + (["1", "X", "2"] as MatchOutcome[]).reduce((inner, outcome) => {
      const expected = row.actualOutcome === outcome ? 1 : 0;
      const probability = probabilityFor(row.probabilities, outcome);
      return inner + (probability - expected) ** 2;
    }, 0) / 3;
  }, 0) / sampleCount;
  const baseline = { home: 1 / 3, draw: 1 / 3, away: 1 / 3 };
  const benchmarkLogLoss = -Math.log(1 / 3);
  const benchmarkBrierScore = predictions.reduce((sum, row) => {
    return sum + (["1", "X", "2"] as MatchOutcome[]).reduce((inner, outcome) => {
      const expected = row.actualOutcome === outcome ? 1 : 0;
      return inner + (probabilityFor(baseline, outcome) - expected) ** 2;
    }, 0) / 3;
  }, 0) / sampleCount;
  const ece = expectedCalibrationError(predictions, config.calibrationBins);
  const calibration = logisticCalibration(predictions);
  const recommended = predictions.filter((row) => row.selectedOutcome !== null);
  const winners = recommended.filter((row) => row.selectedOutcome === row.actualOutcome).length;
  const totalStakeUnits = recommended.reduce((sum, row) => sum + row.stakeUnits, 0);
  const netUnits = recommended.reduce((sum, row) => sum + row.pnlUnits, 0);
  const grossProfit = recommended.reduce((sum, row) => sum + Math.max(row.pnlUnits, 0), 0);
  const grossLoss = Math.abs(recommended.reduce((sum, row) => sum + Math.min(row.pnlUnits, 0), 0));
  const clvRows = recommended.filter((row) => row.clv !== null);
  const drawdown = drawdownMetrics(recommended);
  const dataCompleteness = predictions.reduce((sum, row) => sum + clamp(row.dataCompleteness, 0, 1), 0) / sampleCount;
  const consistentPeriods = countConsistentPeriods(predictions, benchmarkLogLoss);

  return {
    sampleCount,
    foldCount: folds.length,
    accuracy: round(accuracy, 8),
    logLoss: round(logLoss, 8),
    brierScore: round(brierScore, 8),
    ece: round(ece, 8),
    calibrationSlope: calibration ? round(calibration.slope, 8) : null,
    calibrationIntercept: calibration ? round(calibration.intercept, 8) : null,
    benchmarkLogLoss: round(benchmarkLogLoss, 8),
    benchmarkBrierScore: round(benchmarkBrierScore, 8),
    recommendationCount: recommended.length,
    recommendationHitRate: recommended.length ? round(winners / recommended.length, 8) : null,
    totalStakeUnits: round(totalStakeUnits, 6),
    netUnits: round(netUnits, 6),
    yield: totalStakeUnits > 0 ? round(netUnits / totalStakeUnits, 8) : null,
    profitFactor: grossLoss > 0 ? round(grossProfit / grossLoss, 8) : grossProfit > 0 ? null : 0,
    averageClv: clvRows.length ? round(clvRows.reduce((sum, row) => sum + (row.clv ?? 0), 0) / clvRows.length, 8) : null,
    maxDrawdownUnits: round(drawdown.maxDrawdown, 6),
    maxLosingStreak: drawdown.maxLosingStreak,
    dataCompleteness: round(dataCompleteness, 8),
    consistentPeriods,
  };
}

function expectedCalibrationError(predictions: EvaluatedPrediction[], binCount: number) {
  let total = 0;
  for (let index = 0; index < binCount; index += 1) {
    const lower = index / binCount;
    const upper = (index + 1) / binCount;
    const rows = predictions.filter((row) => {
      const confidence = probabilityFor(row.probabilities, row.predictedOutcome);
      return confidence >= lower && (index === binCount - 1 ? confidence <= upper : confidence < upper);
    });
    if (!rows.length) continue;
    const confidence = rows.reduce((sum, row) => sum + probabilityFor(row.probabilities, row.predictedOutcome), 0) / rows.length;
    const accuracy = rows.filter((row) => row.correct).length / rows.length;
    total += (rows.length / predictions.length) * Math.abs(accuracy - confidence);
  }
  return total;
}

function logisticCalibration(predictions: EvaluatedPrediction[]) {
  if (predictions.length < 30) return null;
  const rows = predictions.map((row) => {
    const confidence = clamp(probabilityFor(row.probabilities, row.predictedOutcome), 1e-6, 1 - 1e-6);
    return { x: Math.log(confidence / (1 - confidence)), y: row.correct ? 1 : 0 };
  });
  let intercept = 0;
  let slope = 1;
  for (let iteration = 0; iteration < 30; iteration += 1) {
    let g0 = 0; let g1 = 0; let h00 = 0; let h01 = 0; let h11 = 0;
    for (const row of rows) {
      const probability = 1 / (1 + Math.exp(-(intercept + slope * row.x)));
      const weight = Math.max(probability * (1 - probability), 1e-8);
      const residual = row.y - probability;
      g0 += residual;
      g1 += residual * row.x;
      h00 += weight;
      h01 += weight * row.x;
      h11 += weight * row.x * row.x;
    }
    const determinant = h00 * h11 - h01 * h01;
    if (Math.abs(determinant) < 1e-10) return null;
    const delta0 = (g0 * h11 - g1 * h01) / determinant;
    const delta1 = (g1 * h00 - g0 * h01) / determinant;
    intercept += delta0;
    slope += delta1;
    if (Math.abs(delta0) + Math.abs(delta1) < 1e-7) break;
  }
  return Number.isFinite(intercept) && Number.isFinite(slope) ? { intercept, slope } : null;
}

function drawdownMetrics(rows: EvaluatedPrediction[]) {
  let balance = 0;
  let peak = 0;
  let maxDrawdown = 0;
  let losingStreak = 0;
  let maxLosingStreak = 0;
  for (const row of rows) {
    balance += row.pnlUnits;
    peak = Math.max(peak, balance);
    maxDrawdown = Math.max(maxDrawdown, peak - balance);
    if (row.pnlUnits < 0) {
      losingStreak += 1;
      maxLosingStreak = Math.max(maxLosingStreak, losingStreak);
    } else if (row.pnlUnits > 0) {
      losingStreak = 0;
    }
  }
  return { maxDrawdown, maxLosingStreak };
}

function countConsistentPeriods(rows: EvaluatedPrediction[], benchmarkLogLoss: number) {
  const periods = new Map<string, EvaluatedPrediction[]>();
  for (const row of rows) {
    const key = row.kickoffAt.slice(0, 7);
    periods.set(key, [...(periods.get(key) ?? []), row]);
  }
  let count = 0;
  for (const periodRows of periods.values()) {
    if (periodRows.length < 10) continue;
    const loss = periodRows.reduce((sum, row) => sum - Math.log(Math.max(probabilityFor(row.probabilities, row.actualOutcome), 1e-12)), 0) / periodRows.length;
    if (loss < benchmarkLogLoss) count += 1;
  }
  return count;
}

function removeMargin(odds: MarketOdds): ProbabilityTriple {
  const inverses = [1 / odds.home, 1 / odds.draw, 1 / odds.away];
  const total = inverses.reduce((sum, value) => sum + value, 0);
  return { home: inverses[0] / total, draw: inverses[1] / total, away: inverses[2] / total };
}

function maxOutcome(probabilities: ProbabilityTriple): MatchOutcome {
  if (probabilities.home >= probabilities.draw && probabilities.home >= probabilities.away) return "1";
  if (probabilities.draw >= probabilities.away) return "X";
  return "2";
}

function probabilityFor(probabilities: ProbabilityTriple, outcome: MatchOutcome) {
  return outcome === "1" ? probabilities.home : outcome === "X" ? probabilities.draw : probabilities.away;
}

function oddsFor(odds: MarketOdds, outcome: MatchOutcome) {
  return outcome === "1" ? odds.home : outcome === "X" ? odds.draw : odds.away;
}

function closingOddsFor(odds: MarketOdds, outcome: MatchOutcome) {
  return outcome === "1" ? odds.closingHome ?? null : outcome === "X" ? odds.closingDraw ?? null : odds.closingAway ?? null;
}

function normalizeFormConfig(partial: Partial<FormModelConfig> = {}): FormModelConfig {
  const config = { ...defaultFormModelConfig, ...partial };
  for (const [key, value] of Object.entries(config)) {
    if (!Number.isFinite(value)) throw new ModelLabValidationError(`${key} must be a finite number.`);
  }
  const windowTotal = config.lastFiveWeight + config.lastTenWeight + config.momentumWeight;
  const componentTotal = config.resultWeight + config.dominanceWeight + config.scoreControlWeight;
  if (Math.abs(windowTotal - 1) > 1e-6 || Math.abs(componentTotal - 1) > 1e-6) {
    throw new ModelLabValidationError("Form model weights must sum to one within each layer.");
  }
  if (config.h2hWeight < 0 || config.h2hWeight > 0.12) {
    throw new ModelLabValidationError("H2H weight is capped at 12% and must be selected by backtest.");
  }
  return config;
}

function normalizeBacktestConfig(partial: Partial<BacktestConfig> = {}): BacktestConfig {
  const config = { ...defaultBacktestConfig, ...partial };
  for (const [key, value] of Object.entries(config)) {
    if (!Number.isFinite(value)) throw new ModelLabValidationError(`${key} must be a finite number.`);
  }
  if (config.minOdds < 1.2) throw new ModelLabValidationError("The beta minimum odds filter cannot be lower than 1.20.");
  if (config.minEdge < 0 || config.minEdge > 0.5) throw new ModelLabValidationError("Minimum edge must be between zero and 0.50.");
  if (config.minTopProbability < 1 / 3 || config.minTopProbability >= 1) throw new ModelLabValidationError("Top probability threshold must be between one-third and one.");
  if (config.minRecommendationDataCompleteness < 0.5 || config.minRecommendationDataCompleteness > 1) throw new ModelLabValidationError("Recommendation data completeness must be between 0.50 and one.");
  if (config.kellyMultiplier < 0 || config.kellyMultiplier > 0.25) throw new ModelLabValidationError("Kelly multiplier is capped at quarter Kelly.");
  if (config.maxStakeFraction <= 0 || config.maxStakeFraction > 0.02) throw new ModelLabValidationError("Stake fraction must be within the 2% system hard cap.");
  if (!Number.isInteger(config.minTrainSize) || config.minTrainSize < 20 || config.minTrainSize > 4_000) throw new ModelLabValidationError("minTrainSize must be an integer between 20 and 4,000.");
  if (!Number.isInteger(config.testSize) || config.testSize < 1 || config.testSize > 1_000) throw new ModelLabValidationError("testSize must be an integer between 1 and 1,000.");
  if (!Number.isInteger(config.stepSize) || config.stepSize < 1 || config.stepSize > 1_000) throw new ModelLabValidationError("stepSize must be an integer between 1 and 1,000.");
  if (config.embargoHours < 0 || config.embargoHours > 168) throw new ModelLabValidationError("Embargo must be between zero and 168 hours.");
  if (config.calibrationBins < 5 || config.calibrationBins > 20) throw new ModelLabValidationError("Calibration bins must be between 5 and 20.");
  return config;
}

function normalizeProbabilities(probabilities: ProbabilityTriple): ProbabilityTriple {
  const values = [Math.max(probabilities.home, 0.03), Math.max(probabilities.draw, 0.03), Math.max(probabilities.away, 0.03)];
  const total = values.reduce((sum, value) => sum + value, 0);
  return { home: round(values[0] / total, 8), draw: round(values[1] / total, 8), away: round(values[2] / total, 8) };
}

function validProbabilities(probabilities: ProbabilityTriple | null | undefined) {
  if (!probabilities || typeof probabilities !== "object") return false;
  const values = [probabilities.home, probabilities.draw, probabilities.away];
  return values.every((value) => Number.isFinite(value) && value > 0 && value < 1)
    && Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) <= 1e-5;
}

function validDateMs(value: string, field: string) {
  const result = safeDateMs(value);
  if (result === null) throw new ModelLabValidationError(`${field} must be a valid timestamp.`);
  return result;
}

function safeDateMs(value: string) {
  const result = Date.parse(value);
  return Number.isFinite(result) ? result : null;
}

function weightedAverage(values: Array<[number, number]>) {
  if (!values.length) return 0.5;
  const weight = values.reduce((sum, [, itemWeight]) => sum + itemWeight, 0);
  if (weight <= 0) return 0.5;
  return values.reduce((sum, [value, itemWeight]) => sum + value * itemWeight, 0) / weight;
}

function isFiniteNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
