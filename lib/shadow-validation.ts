import type { MatchOutcome, ProbabilityTriple } from "./model-lab.ts";

export const SHADOW_VALIDATION_SCHEMA_VERSION = "research-shadow-stability-v1" as const;

export type ShadowValidationStatus = "invalid" | "insufficient" | "stable" | "unstable";

export type ShadowValidationObservation = {
  fixtureId: string;
  predictionAt: string;
  kickoffAt: string;
  featureCutoffAt: string;
  resultKnownAt: string;
  actualOutcome: MatchOutcome;
  probabilities: ProbabilityTriple;
  dataCompleteness: number;
};

export type ShadowValidationThresholds = {
  minimumTotalSamples: number;
  minimumWindowSamples: number;
  minimumDataCompleteness: number;
  maximumLateLogLoss: number;
  maximumLateBrierScore: number;
  maximumLateEce: number;
  maximumLogLossDegradation: number;
  maximumBrierDegradation: number;
  maximumEceDegradation: number;
  maximumAccuracyDrop: number;
  maximumProbabilityShift: number;
  calibrationBins: number;
};

export const defaultShadowValidationThresholds: ShadowValidationThresholds = {
  minimumTotalSamples: 40,
  minimumWindowSamples: 20,
  minimumDataCompleteness: 0.55,
  maximumLateLogLoss: 1.098612,
  maximumLateBrierScore: 2 / 9,
  maximumLateEce: 0.12,
  maximumLogLossDegradation: 0.12,
  maximumBrierDegradation: 0.05,
  maximumEceDegradation: 0.06,
  maximumAccuracyDrop: 0.1,
  maximumProbabilityShift: 0.08,
  calibrationBins: 10,
};

export type ShadowWindowMetrics = {
  sampleCount: number;
  startAt: string | null;
  endAt: string | null;
  accuracy: number;
  logLoss: number;
  brierScore: number;
  ece: number;
  dataCompleteness: number;
  meanProbability: ProbabilityTriple;
};

export type ShadowValidationBlocker = {
  code: string;
  message: string;
};

export type ShadowValidationResult = {
  schemaVersion: typeof SHADOW_VALIDATION_SCHEMA_VERSION;
  status: ShadowValidationStatus;
  releaseEligibility: "blocked" | "forward_shadow_candidate";
  researchOnly: boolean;
  forwardObserved: boolean;
  sampleCount: number;
  evaluatedSampleCount: number;
  invalidObservationCount: number;
  leakageViolationCount: number;
  averageDataCompleteness: number;
  earlyWindow: ShadowWindowMetrics;
  lateWindow: ShadowWindowMetrics;
  drift: {
    accuracyDelta: number;
    logLossDelta: number;
    brierDelta: number;
    eceDelta: number;
    probabilityShift: number;
    checks: Array<{
      key: string;
      label: string;
      passed: boolean;
      actual: number;
      target: string;
    }>;
  };
  thresholds: ShadowValidationThresholds;
  blockers: ShadowValidationBlocker[];
};

export function evaluateShadowValidation(input: {
  observations: ShadowValidationObservation[];
  researchOnly: boolean;
  forwardObserved: boolean;
  commercialReuseVerified: boolean;
  revisionTimingVerified: boolean;
  evidenceCompleted: boolean;
  evidenceStatus?: "blocked" | "insufficient" | "inconclusive" | "candidate";
  thresholds?: Partial<ShadowValidationThresholds>;
}): ShadowValidationResult {
  const thresholds = normalizeThresholds(input.thresholds);
  const observations = Array.isArray(input.observations) ? input.observations : [];
  const seen = new Set<string>();
  let invalidObservationCount = 0;
  let leakageViolationCount = 0;
  const valid: ShadowValidationObservation[] = [];

  for (const observation of observations) {
    const audit = auditObservation(observation, seen);
    if (!audit.valid) {
      invalidObservationCount += 1;
      leakageViolationCount += audit.leakageViolations;
      continue;
    }
    seen.add(observation.fixtureId);
    valid.push(observation);
  }
  valid.sort((first, second) => (
    first.kickoffAt.localeCompare(second.kickoffAt)
    || first.fixtureId.localeCompare(second.fixtureId)
  ));

  const splitAt = Math.floor(valid.length / 2);
  const earlyWindow = evaluateWindow(valid.slice(0, splitAt), thresholds.calibrationBins);
  const lateWindow = evaluateWindow(valid.slice(splitAt), thresholds.calibrationBins);
  const averageDataCompleteness = valid.length
    ? round(valid.reduce((sum, row) => sum + row.dataCompleteness, 0) / valid.length)
    : 0;
  const probabilityShift = round((
    Math.abs(lateWindow.meanProbability.home - earlyWindow.meanProbability.home)
    + Math.abs(lateWindow.meanProbability.draw - earlyWindow.meanProbability.draw)
    + Math.abs(lateWindow.meanProbability.away - earlyWindow.meanProbability.away)
  ) / 2);
  const drift = {
    accuracyDelta: round(lateWindow.accuracy - earlyWindow.accuracy),
    logLossDelta: round(lateWindow.logLoss - earlyWindow.logLoss),
    brierDelta: round(lateWindow.brierScore - earlyWindow.brierScore),
    eceDelta: round(lateWindow.ece - earlyWindow.ece),
    probabilityShift,
    checks: [
      check("late_log_loss", "Geç dönem log loss", lateWindow.logLoss <= thresholds.maximumLateLogLoss, lateWindow.logLoss, `≤ ${thresholds.maximumLateLogLoss}`),
      check("late_brier", "Geç dönem Brier", lateWindow.brierScore <= thresholds.maximumLateBrierScore, lateWindow.brierScore, `≤ ${round(thresholds.maximumLateBrierScore)}`),
      check("late_ece", "Geç dönem ECE", lateWindow.ece <= thresholds.maximumLateEce, lateWindow.ece, `≤ ${thresholds.maximumLateEce}`),
      check("log_loss_drift", "Log loss bozulması", lateWindow.logLoss - earlyWindow.logLoss <= thresholds.maximumLogLossDegradation, lateWindow.logLoss - earlyWindow.logLoss, `≤ +${thresholds.maximumLogLossDegradation}`),
      check("brier_drift", "Brier bozulması", lateWindow.brierScore - earlyWindow.brierScore <= thresholds.maximumBrierDegradation, lateWindow.brierScore - earlyWindow.brierScore, `≤ +${thresholds.maximumBrierDegradation}`),
      check("ece_drift", "ECE bozulması", lateWindow.ece - earlyWindow.ece <= thresholds.maximumEceDegradation, lateWindow.ece - earlyWindow.ece, `≤ +${thresholds.maximumEceDegradation}`),
      check("accuracy_drift", "İsabet düşüşü", lateWindow.accuracy - earlyWindow.accuracy >= -thresholds.maximumAccuracyDrop, lateWindow.accuracy - earlyWindow.accuracy, `≥ -${thresholds.maximumAccuracyDrop}`),
      check("probability_shift", "Olasılık dağılım kayması", probabilityShift <= thresholds.maximumProbabilityShift, probabilityShift, `≤ ${thresholds.maximumProbabilityShift}`),
    ],
  };

  const blockers: ShadowValidationBlocker[] = [];
  if (input.researchOnly) blockers.push(blocker("SOURCE_RESEARCH_ONLY", "Kaynak yalnız araştırma amacıyla işaretli."));
  if (!input.commercialReuseVerified) blockers.push(blocker("COMMERCIAL_REUSE_UNVERIFIED", "Ticari yeniden kullanım hakkı doğrulanmadı."));
  if (!input.revisionTimingVerified) blockers.push(blocker("REVISION_TIMING_UNVERIFIED", "Kaynak revizyon ve yakalama zamanı doğrulanmadı."));
  if (!input.forwardObserved) blockers.push(blocker("NO_FORWARD_SHADOW_OBSERVATION", "Tahminler sonuç bilinmeden önce ileri-zamanlı olarak kaydedilmedi."));
  if (!input.evidenceCompleted) blockers.push(blocker("EVIDENCE_NOT_COMPLETED", "Ablation, kalibrasyon ve dokunulmamış holdout kanıtı tamamlanmadı."));
  if (input.evidenceStatus === "insufficient") blockers.push(blocker("EVIDENCE_INSUFFICIENT", "Kanıt koşusunun örnek büyüklüğü yetersiz."));
  if (input.evidenceStatus === "inconclusive") blockers.push(blocker("EVIDENCE_INCONCLUSIVE", "Kanıt koşusu aday modeli ayırmak için sonuçsuz kaldı."));
  if (invalidObservationCount > 0) blockers.push(blocker("INVALID_OBSERVATIONS", `${invalidObservationCount} gözlem doğrulama dışı kaldı.`));
  if (leakageViolationCount > 0) blockers.push(blocker("POINT_IN_TIME_VIOLATION", `${leakageViolationCount} zaman-noktalı veri ihlali bulundu.`));
  if (valid.length < thresholds.minimumTotalSamples
    || earlyWindow.sampleCount < thresholds.minimumWindowSamples
    || lateWindow.sampleCount < thresholds.minimumWindowSamples) {
    blockers.push(blocker("SAMPLE_WINDOW_TOO_SMALL", `Toplam en az ${thresholds.minimumTotalSamples}, dönem başına en az ${thresholds.minimumWindowSamples} gözlem gerekir.`));
  }
  if (averageDataCompleteness < thresholds.minimumDataCompleteness) {
    blockers.push(blocker("DATA_COMPLETENESS_BELOW_THRESHOLD", `Ortalama veri tamlığı ${thresholds.minimumDataCompleteness} eşiğinin altında.`));
  }
  if (drift.checks.some((item) => !item.passed)) {
    blockers.push(blocker("TEMPORAL_STABILITY_GATE_FAILED", "Geç dönem kalite veya drift eşiklerinden en az biri geçilemedi."));
  }

  let status: ShadowValidationStatus = "stable";
  if (invalidObservationCount > 0 || leakageViolationCount > 0) status = "invalid";
  else if (valid.length < thresholds.minimumTotalSamples
    || earlyWindow.sampleCount < thresholds.minimumWindowSamples
    || lateWindow.sampleCount < thresholds.minimumWindowSamples
    || !input.evidenceCompleted) status = "insufficient";
  else if (averageDataCompleteness < thresholds.minimumDataCompleteness
    || drift.checks.some((item) => !item.passed)) status = "unstable";

  const releaseEligibility = status === "stable" && blockers.length === 0
    ? "forward_shadow_candidate" as const
    : "blocked" as const;

  return {
    schemaVersion: SHADOW_VALIDATION_SCHEMA_VERSION,
    status,
    releaseEligibility,
    researchOnly: input.researchOnly,
    forwardObserved: input.forwardObserved,
    sampleCount: observations.length,
    evaluatedSampleCount: valid.length,
    invalidObservationCount,
    leakageViolationCount,
    averageDataCompleteness,
    earlyWindow,
    lateWindow,
    drift,
    thresholds,
    blockers,
  };
}

function auditObservation(observation: ShadowValidationObservation, seen: Set<string>) {
  if (!observation || typeof observation !== "object" || typeof observation.fixtureId !== "string" || !observation.fixtureId.trim()) {
    return { valid: false, leakageViolations: 0 };
  }
  if (seen.has(observation.fixtureId)) return { valid: false, leakageViolations: 0 };
  const predictionAt = Date.parse(observation.predictionAt);
  const kickoffAt = Date.parse(observation.kickoffAt);
  const featureCutoffAt = Date.parse(observation.featureCutoffAt);
  const resultKnownAt = Date.parse(observation.resultKnownAt);
  const validDates = [predictionAt, kickoffAt, featureCutoffAt, resultKnownAt].every(Number.isFinite);
  const leakageViolations = validDates
    ? Number(predictionAt >= kickoffAt) + Number(featureCutoffAt > predictionAt) + Number(resultKnownAt <= kickoffAt)
    : 0;
  const probabilities = observation.probabilities;
  const values = probabilities ? [probabilities.home, probabilities.draw, probabilities.away] : [];
  const validProbabilities = values.length === 3
    && values.every((value) => Number.isFinite(value) && value > 0 && value < 1)
    && Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) <= 1e-5;
  const validOutcome = observation.actualOutcome === "1" || observation.actualOutcome === "X" || observation.actualOutcome === "2";
  const validCompleteness = Number.isFinite(observation.dataCompleteness)
    && observation.dataCompleteness >= 0
    && observation.dataCompleteness <= 1;
  return {
    valid: validDates && leakageViolations === 0 && validProbabilities && validOutcome && validCompleteness,
    leakageViolations,
  };
}

function evaluateWindow(rows: ShadowValidationObservation[], binCount: number): ShadowWindowMetrics {
  if (!rows.length) {
    return {
      sampleCount: 0,
      startAt: null,
      endAt: null,
      accuracy: 0,
      logLoss: 0,
      brierScore: 0,
      ece: 0,
      dataCompleteness: 0,
      meanProbability: { home: 0, draw: 0, away: 0 },
    };
  }
  const scored = rows.map((row) => {
    const predictedOutcome = maxOutcome(row.probabilities);
    return {
      ...row,
      predictedOutcome,
      confidence: probabilityFor(row.probabilities, predictedOutcome),
      correct: predictedOutcome === row.actualOutcome,
    };
  });
  const sampleCount = scored.length;
  const meanProbability = {
    home: round(scored.reduce((sum, row) => sum + row.probabilities.home, 0) / sampleCount),
    draw: round(scored.reduce((sum, row) => sum + row.probabilities.draw, 0) / sampleCount),
    away: round(scored.reduce((sum, row) => sum + row.probabilities.away, 0) / sampleCount),
  };
  const logLoss = scored.reduce((sum, row) => (
    sum - Math.log(Math.max(probabilityFor(row.probabilities, row.actualOutcome), 1e-12))
  ), 0) / sampleCount;
  const brierScore = scored.reduce((sum, row) => (
    sum + (["1", "X", "2"] as MatchOutcome[]).reduce((inner, outcome) => {
      const expected = outcome === row.actualOutcome ? 1 : 0;
      return inner + (probabilityFor(row.probabilities, outcome) - expected) ** 2;
    }, 0) / 3
  ), 0) / sampleCount;
  return {
    sampleCount,
    startAt: scored[0].kickoffAt,
    endAt: scored[scored.length - 1].kickoffAt,
    accuracy: round(scored.filter((row) => row.correct).length / sampleCount),
    logLoss: round(logLoss),
    brierScore: round(brierScore),
    ece: round(expectedCalibrationError(scored, binCount)),
    dataCompleteness: round(scored.reduce((sum, row) => sum + row.dataCompleteness, 0) / sampleCount),
    meanProbability,
  };
}

function expectedCalibrationError(
  rows: Array<{ confidence: number; correct: boolean }>,
  binCount: number,
) {
  let total = 0;
  for (let index = 0; index < binCount; index += 1) {
    const lower = index / binCount;
    const upper = (index + 1) / binCount;
    const bin = rows.filter((row) => row.confidence >= lower && (index === binCount - 1 ? row.confidence <= upper : row.confidence < upper));
    if (!bin.length) continue;
    const confidence = bin.reduce((sum, row) => sum + row.confidence, 0) / bin.length;
    const accuracy = bin.filter((row) => row.correct).length / bin.length;
    total += (bin.length / rows.length) * Math.abs(accuracy - confidence);
  }
  return total;
}

function maxOutcome(probabilities: ProbabilityTriple): MatchOutcome {
  return ([
    ["1", probabilities.home],
    ["X", probabilities.draw],
    ["2", probabilities.away],
  ] as Array<[MatchOutcome, number]>).sort((first, second) => second[1] - first[1])[0][0];
}

function probabilityFor(probabilities: ProbabilityTriple, outcome: MatchOutcome) {
  return outcome === "1" ? probabilities.home : outcome === "X" ? probabilities.draw : probabilities.away;
}

function normalizeThresholds(partial: Partial<ShadowValidationThresholds> | undefined) {
  const thresholds = { ...defaultShadowValidationThresholds, ...(partial ?? {}) };
  for (const [key, value] of Object.entries(thresholds)) {
    if (!Number.isFinite(value) || value <= 0) throw new TypeError(`Invalid shadow validation threshold: ${key}.`);
  }
  return thresholds;
}

function check(key: string, label: string, passed: boolean, actual: number, target: string) {
  return { key, label, passed, actual: round(actual), target };
}

function blocker(code: string, message: string): ShadowValidationBlocker {
  return { code, message };
}

function round(value: number) {
  return Math.round(value * 100_000_000) / 100_000_000;
}
