import {
  ModelLabValidationError,
  buildFormAdvantageFeatures,
  type FormAdvantageInput,
  type FormModelConfig,
  type MatchOutcome,
  type ProbabilityTriple,
} from "./model-lab.ts";

export const ABLATION_SCHEMA_VERSION = "form-ablation-v1" as const;
export const EVIDENCE_SCHEMA_VERSION = "temporal-holdout-calibration-v1" as const;

export const FORM_ABLATION_CODES = [
  "full",
  "results-only",
  "no-results",
  "no-dominance",
  "flat-recency",
  "no-venue",
  "h2h-4",
  "h2h-8",
  "h2h-12",
] as const;

export const EVIDENCE_MODEL_CODES = [
  "form-dominance-baseline",
  "elo-baseline",
  "poisson-baseline",
  "dixon-coles-baseline",
] as const;

export type FormAblationCode = typeof FORM_ABLATION_CODES[number];
export type EvidenceModelCode = typeof EVIDENCE_MODEL_CODES[number];
export type EvidenceStatus = "blocked" | "insufficient" | "inconclusive" | "candidate";

export type FormAblationForecast = {
  ablationSchemaVersion: typeof ABLATION_SCHEMA_VERSION;
  variants: Record<FormAblationCode, {
    probabilities: ProbabilityTriple;
    adjustedFormDifference: number;
    h2hContribution: number;
  }>;
};

export type EvidenceObservation = {
  fixtureId: string;
  predictionAt: string;
  kickoffAt: string;
  resultKnownAt: string;
  actualOutcome: MatchOutcome;
  dataCompleteness: number;
  forecasts: Record<EvidenceModelCode, ProbabilityTriple>;
  ablations: FormAblationForecast;
};

export type ReliabilityBin = {
  lower: number;
  upper: number;
  count: number;
  meanConfidence: number;
  accuracy: number;
};

export type ProbabilityMetrics = {
  sampleCount: number;
  accuracy: number;
  accuracyLower95: number;
  accuracyUpper95: number;
  logLoss: number;
  brierScore: number;
  ece: number;
  reliability: ReliabilityBin[];
};

export type EvidenceAnalysisConfig = {
  developmentFraction: number;
  calibrationFraction: number;
  embargoHours: number;
  calibrationBins: number;
  minimumPartitionSamples: number;
  minimumH2hSelectionSamples: number;
  minimumHoldoutForCandidate: number;
  minimumAblationLogLossGain: number;
  minimumH2hLogLossGain: number;
  minimumCalibrationLogLossGain: number;
  bootstrapIterations: number;
};

export const defaultEvidenceAnalysisConfig: EvidenceAnalysisConfig = {
  developmentFraction: 0.6,
  calibrationFraction: 0.2,
  embargoHours: 6,
  calibrationBins: 10,
  minimumPartitionSamples: 20,
  minimumH2hSelectionSamples: 400,
  minimumHoldoutForCandidate: 100,
  minimumAblationLogLossGain: 0.005,
  minimumH2hLogLossGain: 0.01,
  minimumCalibrationLogLossGain: 0.002,
  bootstrapIterations: 400,
};

export function buildFormAblationForecast(input: FormAdvantageInput): FormAblationForecast {
  const variants = {} as FormAblationForecast["variants"];
  for (const code of FORM_ABLATION_CODES) {
    const features = buildFormAdvantageFeatures({
      ...input,
      config: { ...(input.config ?? {}), ...ablationConfig(code) },
    });
    variants[code] = {
      probabilities: features.probabilities,
      adjustedFormDifference: features.adjustedFormDifference,
      h2hContribution: features.h2hContribution,
    };
  }
  return { ablationSchemaVersion: ABLATION_SCHEMA_VERSION, variants };
}

export function applyTemperatureScaling(probabilities: ProbabilityTriple, temperature: number) {
  if (!validProbabilities(probabilities) || !Number.isFinite(temperature) || temperature < 0.25 || temperature > 5) {
    throw new ModelLabValidationError("Temperature scaling inputs are invalid.");
  }
  const logits = [probabilities.home, probabilities.draw, probabilities.away]
    .map((value) => Math.log(Math.max(value, 1e-12)) / temperature);
  const maximum = Math.max(...logits);
  const exponentials = logits.map((value) => Math.exp(value - maximum));
  const total = exponentials.reduce((sum, value) => sum + value, 0);
  return {
    home: round(exponentials[0] / total, 8),
    draw: round(exponentials[1] / total, 8),
    away: round(exponentials[2] / total, 8),
  };
}

export function fitTemperatureScaling(
  observations: EvidenceObservation[],
  probabilitiesFor: (observation: EvidenceObservation) => ProbabilityTriple,
  minimumGain = defaultEvidenceAnalysisConfig.minimumCalibrationLogLossGain,
) {
  if (observations.length < 10) throw new ModelLabValidationError("Temperature fitting requires at least 10 calibration samples.");
  const rawMetrics = evaluateProbabilityMetrics(observations, probabilitiesFor);
  let fittedTemperature = 1;
  let fittedLogLoss = rawMetrics.logLoss;
  for (let index = 0; index <= 250; index += 1) {
    const temperature = round(0.5 + index * 0.01, 2);
    const logLoss = multiclassLogLoss(observations, (observation) => (
      applyTemperatureScaling(probabilitiesFor(observation), temperature)
    ));
    if (logLoss < fittedLogLoss - 1e-10
      || (Math.abs(logLoss - fittedLogLoss) <= 1e-10 && Math.abs(temperature - 1) < Math.abs(fittedTemperature - 1))) {
      fittedTemperature = temperature;
      fittedLogLoss = logLoss;
    }
  }
  const gain = rawMetrics.logLoss - fittedLogLoss;
  const accepted = gain >= minimumGain;
  return {
    fittedTemperature,
    selectedTemperature: accepted ? fittedTemperature : 1,
    accepted,
    calibrationRawLogLoss: rawMetrics.logLoss,
    calibrationFittedLogLoss: fittedLogLoss,
    calibrationGain: round(gain, 8),
  };
}

export function splitTemporalEvidence(
  observations: EvidenceObservation[],
  partial: Partial<EvidenceAnalysisConfig> = {},
) {
  const config = normalizeEvidenceConfig(partial);
  if (!Array.isArray(observations) || observations.length < config.minimumPartitionSamples * 3) {
    throw new ModelLabValidationError(`Temporal evidence requires at least ${config.minimumPartitionSamples * 3} samples.`);
  }
  const ordered = normalizeObservations(observations);
  const holdoutFraction = 1 - config.developmentFraction - config.calibrationFraction;
  let holdoutCount = Math.max(config.minimumPartitionSamples, Math.floor(ordered.length * holdoutFraction));
  let calibrationCount = Math.max(config.minimumPartitionSamples, Math.floor(ordered.length * config.calibrationFraction));
  let developmentCount = ordered.length - calibrationCount - holdoutCount;
  if (developmentCount < config.minimumPartitionSamples) {
    const deficit = config.minimumPartitionSamples - developmentCount;
    const calibrationReduction = Math.min(deficit, calibrationCount - config.minimumPartitionSamples);
    calibrationCount -= calibrationReduction;
    holdoutCount -= deficit - calibrationReduction;
    developmentCount = ordered.length - calibrationCount - holdoutCount;
  }
  if (developmentCount < config.minimumPartitionSamples || holdoutCount < config.minimumPartitionSamples) {
    throw new ModelLabValidationError("Temporal evidence partitions are too small after applying minimum sizes.");
  }

  const holdout = ordered.slice(ordered.length - holdoutCount);
  const holdoutStartMs = Date.parse(holdout[0].kickoffAt);
  const embargoMs = config.embargoHours * 3_600_000;
  const calibrationCandidates = ordered.slice(developmentCount, ordered.length - holdoutCount);
  const calibration = calibrationCandidates.filter((row) => Date.parse(row.resultKnownAt) <= holdoutStartMs - embargoMs);
  if (calibration.length < config.minimumPartitionSamples) {
    throw new ModelLabValidationError("Calibration results do not clear the embargo before holdout begins.");
  }
  const calibrationStartMs = Date.parse(calibration[0].kickoffAt);
  const developmentCandidates = ordered.slice(0, developmentCount);
  const development = developmentCandidates.filter((row) => Date.parse(row.resultKnownAt) <= calibrationStartMs - embargoMs);
  if (development.length < config.minimumPartitionSamples) {
    throw new ModelLabValidationError("Development results do not clear the embargo before calibration begins.");
  }

  assertPartitionOrder(development, calibration, holdout, embargoMs);
  return {
    config,
    development,
    calibration,
    holdout,
    droppedForEmbargo: ordered.length - development.length - calibration.length - holdout.length,
    boundaries: {
      developmentStartAt: development[0].kickoffAt,
      developmentEndAt: development.at(-1)?.kickoffAt ?? development[0].kickoffAt,
      calibrationStartAt: calibration[0].kickoffAt,
      calibrationEndAt: calibration.at(-1)?.kickoffAt ?? calibration[0].kickoffAt,
      holdoutStartAt: holdout[0].kickoffAt,
      holdoutEndAt: holdout.at(-1)?.kickoffAt ?? holdout[0].kickoffAt,
    },
  };
}

export function evaluateProbabilityMetrics(
  observations: EvidenceObservation[],
  probabilitiesFor: (observation: EvidenceObservation) => ProbabilityTriple,
  binCount = 10,
): ProbabilityMetrics {
  if (!observations.length || !Number.isInteger(binCount) || binCount < 5 || binCount > 20) {
    throw new ModelLabValidationError("Probability metrics require samples and 5–20 calibration bins.");
  }
  const rows = observations.map((observation) => {
    const probabilities = probabilitiesFor(observation);
    if (!validProbabilities(probabilities)) throw new ModelLabValidationError(`Fixture ${observation.fixtureId} has invalid evidence probabilities.`);
    const predictedOutcome = maxOutcome(probabilities);
    return {
      probabilities,
      actualOutcome: observation.actualOutcome,
      predictedOutcome,
      correct: predictedOutcome === observation.actualOutcome,
      confidence: probabilityFor(probabilities, predictedOutcome),
    };
  });
  const accuracy = rows.filter((row) => row.correct).length / rows.length;
  const logLoss = rows.reduce((sum, row) => sum - Math.log(Math.max(probabilityFor(row.probabilities, row.actualOutcome), 1e-12)), 0) / rows.length;
  const brierScore = rows.reduce((sum, row) => sum + (["1", "X", "2"] as MatchOutcome[]).reduce((inner, outcome) => {
    const expected = row.actualOutcome === outcome ? 1 : 0;
    return inner + (probabilityFor(row.probabilities, outcome) - expected) ** 2;
  }, 0) / 3, 0) / rows.length;
  const reliability: ReliabilityBin[] = [];
  let ece = 0;
  for (let index = 0; index < binCount; index += 1) {
    const lower = index / binCount;
    const upper = (index + 1) / binCount;
    const bin = rows.filter((row) => row.confidence >= lower && (index === binCount - 1 ? row.confidence <= upper : row.confidence < upper));
    if (!bin.length) continue;
    const meanConfidence = bin.reduce((sum, row) => sum + row.confidence, 0) / bin.length;
    const binAccuracy = bin.filter((row) => row.correct).length / bin.length;
    ece += (bin.length / rows.length) * Math.abs(meanConfidence - binAccuracy);
    reliability.push({
      lower: round(lower, 4),
      upper: round(upper, 4),
      count: bin.length,
      meanConfidence: round(meanConfidence, 8),
      accuracy: round(binAccuracy, 8),
    });
  }
  const interval = wilsonInterval(rows.filter((row) => row.correct).length, rows.length);
  return {
    sampleCount: rows.length,
    accuracy: round(accuracy, 8),
    accuracyLower95: round(interval.lower, 8),
    accuracyUpper95: round(interval.upper, 8),
    logLoss: round(logLoss, 8),
    brierScore: round(brierScore, 8),
    ece: round(ece, 8),
    reliability,
  };
}

export function runEvidenceAnalysis(input: {
  observations: EvidenceObservation[];
  researchOnly: boolean;
  config?: Partial<EvidenceAnalysisConfig>;
}) {
  const partition = splitTemporalEvidence(input.observations, input.config);
  const ablationRows = FORM_ABLATION_CODES.map((code) => ({
    code,
    metrics: evaluateProbabilityMetrics(
      partition.development,
      (observation) => observation.ablations.variants[code].probabilities,
      partition.config.calibrationBins,
    ),
  }));
  const full = ablationRows.find((row) => row.code === "full");
  if (!full) throw new ModelLabValidationError("The full form baseline is missing from ablation evidence.");
  const rankedAblations = [...ablationRows].sort((first, second) => (
    first.metrics.logLoss - second.metrics.logLoss
    || first.metrics.brierScore - second.metrics.brierScore
    || FORM_ABLATION_CODES.indexOf(first.code) - FORM_ABLATION_CODES.indexOf(second.code)
  ));
  const topAblation = rankedAblations[0];
  const topH2hBlocked = topAblation.code.startsWith("h2h-")
    && partition.development.length < partition.config.minimumH2hSelectionSamples;
  const bestAblation = rankedAblations.find((row) => (
    !row.code.startsWith("h2h-")
    || partition.development.length >= partition.config.minimumH2hSelectionSamples
  )) ?? full;
  const isH2h = bestAblation.code.startsWith("h2h-");
  const requiredGain = isH2h
    ? partition.config.minimumH2hLogLossGain
    : partition.config.minimumAblationLogLossGain;
  const selectedFormVariant = bestAblation.code !== "full"
    && full.metrics.logLoss - bestAblation.metrics.logLoss >= requiredGain
    && bestAblation.metrics.brierScore <= full.metrics.brierScore
    ? bestAblation.code
    : "full";
  const selectionReason = selectedFormVariant === "full"
    ? topH2hBlocked
      ? `H2H adayı en az ${partition.config.minimumH2hSelectionSamples} geliştirme örneği olmadan seçilemez.`
      : "Hiçbir varyant önceden tanımlı log loss ve Brier eşiğini birlikte geçmedi."
    : `${selectedFormVariant} geliştirme diliminde gerekli kayıp iyileşmesini sağladı.`;

  const modelResults = EVIDENCE_MODEL_CODES.map((modelCode, modelIndex) => {
    const rawFor = (observation: EvidenceObservation) => modelCode === "form-dominance-baseline"
      ? observation.ablations.variants[selectedFormVariant].probabilities
      : observation.forecasts[modelCode];
    const temperature = fitTemperatureScaling(
      partition.calibration,
      rawFor,
      partition.config.minimumCalibrationLogLossGain,
    );
    const calibratedFor = (observation: EvidenceObservation) => (
      applyTemperatureScaling(rawFor(observation), temperature.selectedTemperature)
    );
    const rawHoldout = evaluateProbabilityMetrics(partition.holdout, rawFor, partition.config.calibrationBins);
    const calibratedHoldout = evaluateProbabilityMetrics(partition.holdout, calibratedFor, partition.config.calibrationBins);
    const deltaInterval = bootstrapLogLossDelta(
      partition.holdout,
      calibratedFor,
      partition.config.bootstrapIterations,
      0x9e3779b9 ^ ((modelIndex + 1) * 0x45d9f3b),
    );
    const status: EvidenceStatus = input.researchOnly
      ? "blocked"
      : partition.holdout.length < partition.config.minimumHoldoutForCandidate
        ? "insufficient"
        : deltaInterval.upper >= -0.01 || calibratedHoldout.ece > 0.08
          ? "inconclusive"
          : "candidate";
    return {
      modelCode,
      status,
      calibration: temperature,
      rawHoldout,
      calibratedHoldout,
      logLossVsUniform: {
        delta: round(calibratedHoldout.logLoss + Math.log(1 / 3), 8),
        lower95: deltaInterval.lower,
        upper95: deltaInterval.upper,
      },
    };
  });
  const holdoutLeader = [...modelResults].sort((first, second) => (
    first.calibratedHoldout.logLoss - second.calibratedHoldout.logLoss
    || first.calibratedHoldout.brierScore - second.calibratedHoldout.brierScore
    || second.calibratedHoldout.accuracy - first.calibratedHoldout.accuracy
    || first.modelCode.localeCompare(second.modelCode)
  ))[0];

  return {
    evidenceSchemaVersion: EVIDENCE_SCHEMA_VERSION,
    researchOnly: input.researchOnly,
    status: input.researchOnly ? "blocked" as const : holdoutLeader.status,
    partition: {
      developmentCount: partition.development.length,
      calibrationCount: partition.calibration.length,
      holdoutCount: partition.holdout.length,
      droppedForEmbargo: partition.droppedForEmbargo,
      boundaries: partition.boundaries,
    },
    ablation: {
      selectedFormVariant,
      selectionReason,
      developmentSampleCount: partition.development.length,
      variants: ablationRows,
    },
    holdoutLeaderModelCode: holdoutLeader.modelCode,
    models: modelResults,
  };
}

function ablationConfig(code: FormAblationCode): Partial<FormModelConfig> {
  if (code === "results-only") return { resultWeight: 1, dominanceWeight: 0, scoreControlWeight: 0 };
  if (code === "no-results") return { resultWeight: 0, dominanceWeight: 0.7916666667, scoreControlWeight: 0.2083333333 };
  if (code === "no-dominance") return { resultWeight: 0.8387096774, dominanceWeight: 0, scoreControlWeight: 0.1612903226 };
  if (code === "flat-recency") return { lastFiveWeight: 0.5, lastTenWeight: 0.5, momentumWeight: 0, recencyHalfLifeMatches: 1_000_000 };
  if (code === "no-venue") return { venueMatchMultiplier: 1 };
  if (code === "h2h-4") return { h2hWeight: 0.04 };
  if (code === "h2h-8") return { h2hWeight: 0.08 };
  if (code === "h2h-12") return { h2hWeight: 0.12 };
  return { h2hWeight: 0 };
}

function normalizeEvidenceConfig(partial: Partial<EvidenceAnalysisConfig>): EvidenceAnalysisConfig {
  const config = { ...defaultEvidenceAnalysisConfig, ...partial };
  if (Object.values(config).some((value) => !Number.isFinite(value))
    || config.developmentFraction < 0.4 || config.developmentFraction > 0.75
    || config.calibrationFraction < 0.1 || config.calibrationFraction > 0.3
    || config.developmentFraction + config.calibrationFraction > 0.9
    || config.embargoHours < 0 || config.embargoHours > 168
    || !Number.isInteger(config.calibrationBins) || config.calibrationBins < 5 || config.calibrationBins > 20
    || !Number.isInteger(config.minimumPartitionSamples) || config.minimumPartitionSamples < 10
    || !Number.isInteger(config.minimumH2hSelectionSamples) || config.minimumH2hSelectionSamples < 100
    || !Number.isInteger(config.minimumHoldoutForCandidate) || config.minimumHoldoutForCandidate < 50
    || !Number.isInteger(config.bootstrapIterations) || config.bootstrapIterations < 100 || config.bootstrapIterations > 2_000) {
    throw new ModelLabValidationError("Evidence analysis configuration is invalid.");
  }
  return config;
}

function normalizeObservations(observations: EvidenceObservation[]) {
  const seen = new Set<string>();
  return observations.map((observation) => {
    if (!observation || typeof observation.fixtureId !== "string" || !observation.fixtureId || seen.has(observation.fixtureId)) {
      throw new ModelLabValidationError("Evidence observations require unique fixture ids.");
    }
    seen.add(observation.fixtureId);
    const predictionMs = Date.parse(observation.predictionAt);
    const kickoffMs = Date.parse(observation.kickoffAt);
    const resultKnownMs = Date.parse(observation.resultKnownAt);
    if (![predictionMs, kickoffMs, resultKnownMs].every(Number.isFinite)
      || predictionMs >= kickoffMs || resultKnownMs < kickoffMs
      || !(["1", "X", "2"] as unknown[]).includes(observation.actualOutcome)
      || observation.ablations.ablationSchemaVersion !== ABLATION_SCHEMA_VERSION
      || EVIDENCE_MODEL_CODES.some((code) => !validProbabilities(observation.forecasts[code]))
      || FORM_ABLATION_CODES.some((code) => !validProbabilities(observation.ablations.variants[code]?.probabilities))) {
      throw new ModelLabValidationError(`Fixture ${observation.fixtureId} has invalid evidence provenance.`);
    }
    return observation;
  }).sort((first, second) => (
    Date.parse(first.kickoffAt) - Date.parse(second.kickoffAt)
    || first.fixtureId.localeCompare(second.fixtureId)
  ));
}

function assertPartitionOrder(
  development: EvidenceObservation[],
  calibration: EvidenceObservation[],
  holdout: EvidenceObservation[],
  embargoMs: number,
) {
  const calibrationStart = Date.parse(calibration[0].kickoffAt);
  const holdoutStart = Date.parse(holdout[0].kickoffAt);
  const latestDevelopmentResult = Math.max(...development.map((row) => Date.parse(row.resultKnownAt)));
  const latestCalibrationResult = Math.max(...calibration.map((row) => Date.parse(row.resultKnownAt)));
  if (latestDevelopmentResult > calibrationStart - embargoMs || latestCalibrationResult > holdoutStart - embargoMs) {
    throw new ModelLabValidationError("Temporal evidence partitions overlap after the embargo.");
  }
}

function multiclassLogLoss(
  observations: EvidenceObservation[],
  probabilitiesFor: (observation: EvidenceObservation) => ProbabilityTriple,
) {
  return observations.reduce((sum, observation) => (
    sum - Math.log(Math.max(probabilityFor(probabilitiesFor(observation), observation.actualOutcome), 1e-12))
  ), 0) / observations.length;
}

function bootstrapLogLossDelta(
  observations: EvidenceObservation[],
  probabilitiesFor: (observation: EvidenceObservation) => ProbabilityTriple,
  iterations: number,
  seed: number,
) {
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
  const uniformLoss = -Math.log(1 / 3);
  const deltas: number[] = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let total = 0;
    for (let index = 0; index < observations.length; index += 1) {
      const observation = observations[Math.floor(random() * observations.length)];
      total += -Math.log(Math.max(probabilityFor(probabilitiesFor(observation), observation.actualOutcome), 1e-12)) - uniformLoss;
    }
    deltas.push(total / observations.length);
  }
  deltas.sort((first, second) => first - second);
  return {
    lower: round(deltas[Math.floor(iterations * 0.025)] ?? deltas[0], 8),
    upper: round(deltas[Math.min(deltas.length - 1, Math.ceil(iterations * 0.975) - 1)] ?? deltas.at(-1) ?? 0, 8),
  };
}

function wilsonInterval(successes: number, total: number) {
  const z = 1.959963984540054;
  const proportion = successes / total;
  const denominator = 1 + z ** 2 / total;
  const center = (proportion + z ** 2 / (2 * total)) / denominator;
  const margin = z * Math.sqrt((proportion * (1 - proportion) + z ** 2 / (4 * total)) / total) / denominator;
  return { lower: Math.max(0, center - margin), upper: Math.min(1, center + margin) };
}

function maxOutcome(probabilities: ProbabilityTriple): MatchOutcome {
  if (probabilities.home >= probabilities.draw && probabilities.home >= probabilities.away) return "1";
  if (probabilities.draw >= probabilities.away) return "X";
  return "2";
}

function probabilityFor(probabilities: ProbabilityTriple, outcome: MatchOutcome) {
  return outcome === "1" ? probabilities.home : outcome === "X" ? probabilities.draw : probabilities.away;
}

function validProbabilities(probabilities: ProbabilityTriple | null | undefined) {
  if (!probabilities) return false;
  const values = [probabilities.home, probabilities.draw, probabilities.away];
  return values.every((value) => Number.isFinite(value) && value > 0 && value < 1)
    && Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) <= 1e-5;
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
