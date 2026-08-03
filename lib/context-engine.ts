import { ModelLabValidationError, type ProbabilityTriple } from "./model-lab.ts";

export const CONTEXT_ENGINE_SCHEMA_VERSION = "fixture-context-v1" as const;

export const CONTEXT_ENGINE_POLICY = {
  minimumCompleteness: 0.8,
  maximumAgeHours: 6,
  maximumProbabilityShift: 0.08,
  maximumUncertaintyShrink: 0.12,
  maximumDirectionalLogit: 0.32,
  recentCoachDays: 30,
} as const;

export type AvailabilityReason = "injury" | "suspension" | "other";

export type UnavailablePlayer = {
  playerId: string;
  reason: AvailabilityReason;
  importance: number;
};

export type TeamContextInput = {
  unavailablePlayers: UnavailablePlayer[];
  coachDaysInRole: number | null;
  importantPlayerForm: number | null;
  travelKm: number | null;
  restHours: number | null;
};

export type MatchContextInput = {
  weatherSeverity: number | null;
  pitchQuality: number | null;
  derby: boolean;
};

export type FixtureContextInput = {
  fixtureId: string;
  capturedAt: string;
  predictionAt: string;
  kickoffAt: string;
  completeness: number;
  baseProbabilities: ProbabilityTriple;
  home: TeamContextInput;
  away: TeamContextInput;
  match: MatchContextInput;
};

export type ContextBlockerCode =
  | "CONTEXT_CAPTURE_INVALID"
  | "CONTEXT_CAPTURE_AFTER_PREDICTION"
  | "CONTEXT_CAPTURE_AFTER_KICKOFF"
  | "CONTEXT_STALE"
  | "CONTEXT_INCOMPLETE";

export function evaluateFixtureContext(input: FixtureContextInput) {
  validateFixtureContext(input);
  const capturedMs = Date.parse(input.capturedAt);
  const predictionMs = Date.parse(input.predictionAt);
  const kickoffMs = Date.parse(input.kickoffAt);
  const blockers: ContextBlockerCode[] = [];
  if (!Number.isFinite(capturedMs) || !Number.isFinite(predictionMs) || !Number.isFinite(kickoffMs)) {
    blockers.push("CONTEXT_CAPTURE_INVALID");
  } else {
    if (capturedMs > predictionMs) blockers.push("CONTEXT_CAPTURE_AFTER_PREDICTION");
    if (capturedMs >= kickoffMs) blockers.push("CONTEXT_CAPTURE_AFTER_KICKOFF");
    if (predictionMs - capturedMs > CONTEXT_ENGINE_POLICY.maximumAgeHours * 3_600_000) {
      blockers.push("CONTEXT_STALE");
    }
  }
  if (input.completeness < CONTEXT_ENGINE_POLICY.minimumCompleteness) {
    blockers.push("CONTEXT_INCOMPLETE");
  }

  const availability = directionalAvailability(input.home, input.away);
  const rest = directionalRest(input.home.restHours, input.away.restHours);
  const travel = directionalTravel(input.home.travelKm, input.away.travelKm);
  const playerForm = directionalPlayerForm(
    input.home.importantPlayerForm,
    input.away.importantPlayerForm,
  );
  const directionalLogit = clamp(
    availability + rest + travel + playerForm,
    -CONTEXT_ENGINE_POLICY.maximumDirectionalLogit,
    CONTEXT_ENGINE_POLICY.maximumDirectionalLogit,
  );

  const uncertainty = uncertaintyShrink(input);
  const directional = normalize({
    home: input.baseProbabilities.home * Math.exp(directionalLogit),
    draw: input.baseProbabilities.draw,
    away: input.baseProbabilities.away * Math.exp(-directionalLogit),
  });
  const shrunk = normalize({
    home: directional.home * (1 - uncertainty) + uncertainty / 3,
    draw: directional.draw * (1 - uncertainty) + uncertainty / 3,
    away: directional.away * (1 - uncertainty) + uncertainty / 3,
  });
  const adjustedProbabilities = capShift(
    input.baseProbabilities,
    shrunk,
    CONTEXT_ENGINE_POLICY.maximumProbabilityShift,
  );
  const maximumProbabilityShift = Math.max(
    Math.abs(adjustedProbabilities.home - input.baseProbabilities.home),
    Math.abs(adjustedProbabilities.draw - input.baseProbabilities.draw),
    Math.abs(adjustedProbabilities.away - input.baseProbabilities.away),
  );

  return {
    schemaVersion: CONTEXT_ENGINE_SCHEMA_VERSION,
    fixtureId: input.fixtureId,
    capturedAt: input.capturedAt,
    predictionAt: input.predictionAt,
    kickoffAt: input.kickoffAt,
    completeness: round(input.completeness, 8),
    recommendationContextEligible: blockers.length === 0,
    blockers: [...new Set(blockers)],
    baseProbabilities: input.baseProbabilities,
    adjustedProbabilities,
    maximumProbabilityShift: round(maximumProbabilityShift, 8),
    uncertaintyShrink: round(uncertainty, 8),
    directionalLogit: round(directionalLogit, 8),
    contributions: {
      availability: round(availability, 8),
      rest: round(rest, 8),
      travel: round(travel, 8),
      importantPlayerForm: round(playerForm, 8),
    },
    policy: CONTEXT_ENGINE_POLICY,
  };
}

function validateFixtureContext(input: FixtureContextInput) {
  if (!input || typeof input !== "object" || !input.fixtureId?.trim()) {
    throw new ModelLabValidationError("A fixture context and fixture id are required.");
  }
  const probabilities = Object.values(input.baseProbabilities ?? {});
  if (probabilities.length !== 3
    || probabilities.some((value) => !Number.isFinite(value) || value <= 0 || value >= 1)
    || Math.abs(probabilities.reduce((sum, value) => sum + value, 0) - 1) > 1e-5) {
    throw new ModelLabValidationError("Context rescore requires normalized base probabilities.");
  }
  if (!Number.isFinite(input.completeness) || input.completeness < 0 || input.completeness > 1) {
    throw new ModelLabValidationError("Context completeness must be between zero and one.");
  }
  for (const team of [input.home, input.away]) {
    if (!team || !Array.isArray(team.unavailablePlayers)) {
      throw new ModelLabValidationError("Home and away context are required.");
    }
    for (const player of team.unavailablePlayers) {
      if (!player.playerId?.trim() || !Number.isFinite(player.importance)
        || player.importance < 0 || player.importance > 1) {
        throw new ModelLabValidationError("Unavailable player importance must be between zero and one.");
      }
    }
    for (const value of [team.coachDaysInRole, team.travelKm, team.restHours]) {
      if (value !== null && (!Number.isFinite(value) || value < 0)) {
        throw new ModelLabValidationError("Context duration and distance values cannot be negative.");
      }
    }
    if (team.importantPlayerForm !== null
      && (!Number.isFinite(team.importantPlayerForm)
        || team.importantPlayerForm < -1
        || team.importantPlayerForm > 1)) {
      throw new ModelLabValidationError("Important-player form must be between minus one and one.");
    }
  }
  if (!input.match) throw new ModelLabValidationError("Match context is required.");
  for (const value of [input.match.weatherSeverity, input.match.pitchQuality]) {
    if (value !== null && (!Number.isFinite(value) || value < 0 || value > 1)) {
      throw new ModelLabValidationError("Weather and pitch values must be between zero and one.");
    }
  }
}

function directionalAvailability(home: TeamContextInput, away: TeamContextInput) {
  const weighted = (team: TeamContextInput) => team.unavailablePlayers.reduce((sum, player) => {
    const reasonWeight = player.reason === "suspension" ? 1 : player.reason === "injury" ? 0.95 : 0.75;
    return sum + player.importance * reasonWeight;
  }, 0);
  return clamp((weighted(away) - weighted(home)) * 0.055, -0.18, 0.18);
}

function directionalRest(home: number | null, away: number | null) {
  if (home === null || away === null) return 0;
  return clamp((home - away) / 72, -1, 1) * 0.045;
}

function directionalTravel(home: number | null, away: number | null) {
  if (home === null || away === null) return 0;
  return clamp((away - home) / 1_500, -1, 1) * 0.035;
}

function directionalPlayerForm(home: number | null, away: number | null) {
  if (home === null || away === null) return 0;
  return clamp(home - away, -2, 2) * 0.035;
}

function uncertaintyShrink(input: FixtureContextInput) {
  const weather = input.match.weatherSeverity ?? 0.5;
  const pitchRisk = input.match.pitchQuality === null ? 0.5 : 1 - input.match.pitchQuality;
  const coachRisk = [input.home.coachDaysInRole, input.away.coachDaysInRole]
    .reduce<number>((sum, days) => sum + (days !== null && days < CONTEXT_ENGINE_POLICY.recentCoachDays ? 1 : 0), 0) / 2;
  const raw = (1 - input.completeness) * 0.5
    + weather * 0.18
    + pitchRisk * 0.16
    + (input.match.derby ? 0.08 : 0)
    + coachRisk * 0.08;
  return clamp(raw, 0, CONTEXT_ENGINE_POLICY.maximumUncertaintyShrink);
}

function capShift(base: ProbabilityTriple, adjusted: ProbabilityTriple, maximum: number) {
  const initialShift = Math.max(
    Math.abs(adjusted.home - base.home),
    Math.abs(adjusted.draw - base.draw),
    Math.abs(adjusted.away - base.away),
  );
  if (initialShift <= maximum) return roundedTriple(adjusted);
  const ratio = maximum / initialShift;
  return roundedTriple(normalize({
    home: base.home + (adjusted.home - base.home) * ratio,
    draw: base.draw + (adjusted.draw - base.draw) * ratio,
    away: base.away + (adjusted.away - base.away) * ratio,
  }));
}

function normalize(value: ProbabilityTriple): ProbabilityTriple {
  const total = value.home + value.draw + value.away;
  return { home: value.home / total, draw: value.draw / total, away: value.away / total };
}

function roundedTriple(value: ProbabilityTriple): ProbabilityTriple {
  const home = round(value.home, 8);
  const draw = round(value.draw, 8);
  return { home, draw, away: round(1 - home - draw, 8) };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export type FixtureContextAssessment = ReturnType<typeof evaluateFixtureContext>;
