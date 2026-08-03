import { ModelLabValidationError } from "./model-lab.ts";

export const BANKROLL_ENGINE_SCHEMA_VERSION = "quarter-kelly-v1" as const;
export type RiskProfile = "cautious" | "balanced" | "bold";
export type StakeKind = "single" | "coupon";

export const BANKROLL_POLICY = {
  kellyMultiplier: 0.25,
  profileCaps: {
    cautious: { single: 0.0075, coupon: 0.0025, totalOpenExposure: 0.03 },
    balanced: { single: 0.0125, coupon: 0.005, totalOpenExposure: 0.05 },
    bold: { single: 0.02, coupon: 0.0075, totalOpenExposure: 0.08 },
  },
} as const;

export function calculateStakeRecommendation(input: {
  bankroll: number;
  currentOpenExposure: number;
  modelProbability: number;
  decimalOdds: number;
  riskProfile: RiskProfile | null;
  kind: StakeKind;
}) {
  validate(input);
  const riskProfile = input.riskProfile ?? "balanced";
  const profile = BANKROLL_POLICY.profileCaps[riskProfile];
  const b = input.decimalOdds - 1;
  const q = 1 - input.modelProbability;
  const fullKellyFraction = (b * input.modelProbability - q) / b;
  const quarterKellyFraction = Math.max(0, fullKellyFraction * BANKROLL_POLICY.kellyMultiplier);
  const stakeCapFraction = profile[input.kind];
  const openExposureFraction = input.bankroll === 0 ? 0 : input.currentOpenExposure / input.bankroll;
  const remainingExposureFraction = Math.max(0, profile.totalOpenExposure - openExposureFraction);
  const recommendedFraction = Math.min(
    quarterKellyFraction,
    stakeCapFraction,
    remainingExposureFraction,
  );
  const flags: string[] = [];
  if (fullKellyFraction <= 0) flags.push("NO_POSITIVE_EDGE");
  if (quarterKellyFraction > stakeCapFraction) flags.push("PROFILE_STAKE_CAP_APPLIED");
  if (remainingExposureFraction <= 0) flags.push("OPEN_EXPOSURE_CAP_REACHED");
  else if (remainingExposureFraction < Math.min(quarterKellyFraction, stakeCapFraction)) {
    flags.push("OPEN_EXPOSURE_CAP_APPLIED");
  }
  if (input.bankroll === 0) flags.push("BANKROLL_NOT_FUNDED");
  return {
    schemaVersion: BANKROLL_ENGINE_SCHEMA_VERSION,
    riskProfile,
    kind: input.kind,
    bankroll: round(input.bankroll, 2),
    currentOpenExposure: round(input.currentOpenExposure, 2),
    modelProbability: round(input.modelProbability, 8),
    decimalOdds: round(input.decimalOdds, 4),
    fullKellyFraction: round(Math.max(0, fullKellyFraction), 8),
    quarterKellyFraction: round(quarterKellyFraction, 8),
    stakeCapFraction,
    totalOpenExposureCapFraction: profile.totalOpenExposure,
    recommendedFraction: round(recommendedFraction, 8),
    recommendedStake: round(input.bankroll * recommendedFraction, 2),
    recommendationEligible: recommendedFraction > 0,
    flags,
  };
}

function validate(input: Parameters<typeof calculateStakeRecommendation>[0]) {
  if (!input || !Number.isFinite(input.bankroll) || input.bankroll < 0) {
    throw new ModelLabValidationError("Bankroll must be a non-negative number.");
  }
  if (!Number.isFinite(input.currentOpenExposure) || input.currentOpenExposure < 0) {
    throw new ModelLabValidationError("Open exposure must be a non-negative number.");
  }
  if (!Number.isFinite(input.modelProbability)
    || input.modelProbability <= 0
    || input.modelProbability >= 1) {
    throw new ModelLabValidationError("Model probability must be between zero and one.");
  }
  if (!Number.isFinite(input.decimalOdds) || input.decimalOdds < 1.01) {
    throw new ModelLabValidationError("Decimal odds must be at least 1.01.");
  }
  if (input.riskProfile !== null
    && !(Object.keys(BANKROLL_POLICY.profileCaps) as string[]).includes(input.riskProfile)) {
    throw new ModelLabValidationError("Risk profile is invalid.");
  }
  if (!( ["single", "coupon"] as string[]).includes(input.kind)) {
    throw new ModelLabValidationError("Stake kind is invalid.");
  }
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
