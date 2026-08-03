import {
  ModelLabValidationError,
  type MatchOutcome,
  type ProbabilityTriple,
} from "./model-lab.ts";

export const PREDICTION_LIFECYCLE_SCHEMA_VERSION = "prediction-lifecycle-v1" as const;
export const FINALIZATION_MINIMUM_DATA_COMPLETENESS = 0.85;
export const MATERIAL_PROBABILITY_SHIFT = 0.08;

export const PREDICTION_STATUSES = [
  "watchlist",
  "final",
  "withdrawn",
  "expired",
] as const;

export const PREDICTION_EVENT_TYPES = [
  "watchlisted",
  "versioned",
  "finalized",
  "withdrawn",
  "reopened",
  "expired",
] as const;

export const PREDICTION_TRIGGERS = [
  "initial_window",
  "scheduled_refresh",
  "lineup_probable",
  "lineup_confirmed",
  "fixture_status_change",
  "manual_review",
] as const;

export type PredictionStatus = typeof PREDICTION_STATUSES[number];
export type PredictionEventType = typeof PREDICTION_EVENT_TYPES[number];
export type PredictionTrigger = typeof PREDICTION_TRIGGERS[number];
export type LineupState = "none" | "probable" | "confirmed";

export type FinalizationBlockerCode =
  | "INVALID_PROBABILITIES"
  | "KICKOFF_STARTED"
  | "FIXTURE_NOT_SCHEDULED"
  | "LINEUPS_NOT_CONFIRMED"
  | "DATA_COMPLETENESS_LOW"
  | "CONTEXT_MISSING"
  | "CONTEXT_INCOMPLETE"
  | "CONTEXT_NOT_READY"
  | "RELEASE_GATE_CLOSED"
  | "SOURCE_RESEARCH_ONLY";

export type VersionSnapshot = {
  versionId?: string;
  predictionAt: string;
  kickoffAt: string;
  fixtureStatus: "scheduled" | "live" | "finished" | "postponed" | "cancelled";
  probabilities: ProbabilityTriple;
  predictedOutcome: MatchOutcome;
  dataCompleteness: number;
  lineupState: LineupState;
  lineupFingerprint: string | null;
  contextFingerprint: string | null;
  contextCompleteness: number | null;
  contextEligible: boolean;
  releaseGateAllowed: boolean;
  researchOnly: boolean;
  featureFingerprint: string;
};

export type MaterialChangeCode =
  | "SELECTION_CHANGED"
  | "PROBABILITY_SHIFT"
  | "LINEUP_CHANGED_AFTER_FINAL"
  | "CONTEXT_CHANGED_AFTER_FINAL"
  | "DATA_COMPLETENESS_DROPPED"
  | "FINALIZATION_GATE_LOST";

export function evaluateFinalizationGate(snapshot: VersionSnapshot) {
  const blockers: FinalizationBlockerCode[] = [];
  const predictionMs = Date.parse(snapshot.predictionAt);
  const kickoffMs = Date.parse(snapshot.kickoffAt);
  if (!validProbabilities(snapshot.probabilities)
    || topOutcome(snapshot.probabilities) !== snapshot.predictedOutcome) {
    blockers.push("INVALID_PROBABILITIES");
  }
  if (!Number.isFinite(predictionMs) || !Number.isFinite(kickoffMs) || predictionMs >= kickoffMs) {
    blockers.push("KICKOFF_STARTED");
  }
  if (snapshot.fixtureStatus !== "scheduled") blockers.push("FIXTURE_NOT_SCHEDULED");
  if (snapshot.lineupState !== "confirmed") blockers.push("LINEUPS_NOT_CONFIRMED");
  if (!Number.isFinite(snapshot.dataCompleteness)
    || snapshot.dataCompleteness < FINALIZATION_MINIMUM_DATA_COMPLETENESS) {
    blockers.push("DATA_COMPLETENESS_LOW");
  }
  if (!snapshot.contextFingerprint) blockers.push("CONTEXT_MISSING");
  else if (snapshot.contextCompleteness === null
    || !Number.isFinite(snapshot.contextCompleteness)
    || snapshot.contextCompleteness < 0.8) blockers.push("CONTEXT_INCOMPLETE");
  else if (!snapshot.contextEligible) blockers.push("CONTEXT_NOT_READY");
  if (!snapshot.releaseGateAllowed) blockers.push("RELEASE_GATE_CLOSED");
  if (snapshot.researchOnly) blockers.push("SOURCE_RESEARCH_ONLY");
  return {
    eligible: blockers.length === 0,
    blockers,
  };
}

export function transitionPredictionStatus(
  current: PredictionStatus | null,
  eventType: PredictionEventType,
): PredictionStatus {
  if (current === null && eventType === "watchlisted") return "watchlist";
  if ((current === "watchlist" || current === "final" || current === "withdrawn")
    && eventType === "versioned") return current;
  if (current === "watchlist" && eventType === "finalized") return "final";
  if ((current === "watchlist" || current === "final") && eventType === "withdrawn") return "withdrawn";
  if (current === "withdrawn" && eventType === "reopened") return "watchlist";
  if (current === "watchlist" && eventType === "expired") return "expired";
  throw new ModelLabValidationError(`Transition ${current ?? "none"} → ${eventType} is not allowed.`);
}

export function assessMaterialChange(previous: VersionSnapshot, current: VersionSnapshot) {
  const reasons: MaterialChangeCode[] = [];
  if (previous.predictedOutcome !== current.predictedOutcome) reasons.push("SELECTION_CHANGED");
  const maximumShift = Math.max(
    Math.abs(previous.probabilities.home - current.probabilities.home),
    Math.abs(previous.probabilities.draw - current.probabilities.draw),
    Math.abs(previous.probabilities.away - current.probabilities.away),
  );
  if (maximumShift >= MATERIAL_PROBABILITY_SHIFT) reasons.push("PROBABILITY_SHIFT");
  if (previous.lineupState === "confirmed"
    && current.lineupState === "confirmed"
    && previous.lineupFingerprint
    && current.lineupFingerprint
    && previous.lineupFingerprint !== current.lineupFingerprint) {
    reasons.push("LINEUP_CHANGED_AFTER_FINAL");
  }
  if (previous.contextFingerprint
    && current.contextFingerprint
    && previous.contextFingerprint !== current.contextFingerprint) {
    reasons.push("CONTEXT_CHANGED_AFTER_FINAL");
  }
  if (previous.dataCompleteness >= FINALIZATION_MINIMUM_DATA_COMPLETENESS
    && current.dataCompleteness < FINALIZATION_MINIMUM_DATA_COMPLETENESS) {
    reasons.push("DATA_COMPLETENESS_DROPPED");
  }
  if (evaluateFinalizationGate(previous).eligible && !evaluateFinalizationGate(current).eligible) {
    reasons.push("FINALIZATION_GATE_LOST");
  }
  return {
    material: reasons.length > 0,
    reasons: [...new Set(reasons)],
    maximumProbabilityShift: round(maximumShift, 8),
  };
}

export function choosePredictionTrigger(input: {
  existingVersionCount: number;
  previousLineupState: LineupState | null;
  currentLineupState: LineupState;
  fixtureStatus: VersionSnapshot["fixtureStatus"];
}): PredictionTrigger {
  if (input.existingVersionCount === 0) return "initial_window";
  if (input.fixtureStatus !== "scheduled") return "fixture_status_change";
  if (input.currentLineupState === "confirmed" && input.previousLineupState !== "confirmed") {
    return "lineup_confirmed";
  }
  if (input.currentLineupState === "probable" && input.previousLineupState === "none") {
    return "lineup_probable";
  }
  return "scheduled_refresh";
}

export function topOutcome(probabilities: ProbabilityTriple): MatchOutcome {
  const rows: Array<[MatchOutcome, number]> = [
    ["1", probabilities.home],
    ["X", probabilities.draw],
    ["2", probabilities.away],
  ];
  return rows.sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]))[0][0];
}

export function canonicalPredictionJson(value: unknown): string {
  if (value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map((item) => canonicalPredictionJson(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([first], [second]) => first.localeCompare(second));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalPredictionJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export async function predictionIdentity(value: unknown) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalPredictionJson(value)),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function validProbabilities(value: ProbabilityTriple) {
  const values = [value.home, value.draw, value.away];
  return values.every((item) => Number.isFinite(item) && item > 0 && item < 1)
    && Math.abs(values.reduce((sum, item) => sum + item, 0) - 1) <= 1e-5;
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
