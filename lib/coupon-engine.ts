import { ModelLabValidationError, type MatchOutcome } from "./model-lab.ts";

export const COUPON_ENGINE_SCHEMA_VERSION = "coupon-safeguards-v1" as const;
export const COUPON_POLICY = {
  candidatePoolLimit: 12,
  maximumSameLeagueLegs: 2,
  maximumAlternativesPerTier: 3,
  balancedLegs: 3,
  highOddsMinimumLegs: 4,
  highOddsMaximumLegs: 6,
  highOddsTarget: 10,
  maximumLowOddsLegs: 2,
} as const;

export type CouponCandidate = {
  id: string;
  fixtureId: string;
  leagueId: string;
  homeTeamId: string;
  awayTeamId: string;
  selection: MatchOutcome;
  modelProbability: number;
  decimalOdds: number;
  expectedValue: number;
  edge: number;
  valueTier: "value" | "low_odds_value";
  recommendationEligible: boolean;
};

export type CouponTier = "balanced" | "high_odds";

export function evaluateCoupon(candidates: CouponCandidate[], tier: CouponTier) {
  if (!Array.isArray(candidates) || !candidates.length) {
    throw new ModelLabValidationError("A coupon requires at least one candidate.");
  }
  for (const candidate of candidates) validateCandidate(candidate);
  const blockers: string[] = [];
  const fixtureIds = candidates.map((candidate) => candidate.fixtureId);
  if (new Set(fixtureIds).size !== fixtureIds.length) blockers.push("SAME_FIXTURE_CORRELATION");
  const teamIds = candidates.flatMap((candidate) => [candidate.homeTeamId, candidate.awayTeamId]);
  if (new Set(teamIds).size !== teamIds.length) blockers.push("REPEATED_TEAM_EXPOSURE");
  const leagueCounts = countBy(candidates.map((candidate) => candidate.leagueId));
  if ([...leagueCounts.values()].some((count) => count > COUPON_POLICY.maximumSameLeagueLegs)) {
    blockers.push("LEAGUE_CONCENTRATION");
  }
  if (candidates.some((candidate) => !candidate.recommendationEligible)) {
    blockers.push("INELIGIBLE_SELECTION");
  }
  if (candidates.filter((candidate) => candidate.valueTier === "low_odds_value").length
    > COUPON_POLICY.maximumLowOddsLegs) {
    blockers.push("LOW_ODDS_CONCENTRATION");
  }
  const combinedOdds = candidates.reduce((product, candidate) => product * candidate.decimalOdds, 1);
  const combinedProbability = candidates.reduce((product, candidate) => product * candidate.modelProbability, 1);
  const expectedReturnMultiple = combinedOdds * combinedProbability;
  return {
    schemaVersion: COUPON_ENGINE_SCHEMA_VERSION,
    tier,
    eligible: blockers.length === 0,
    blockers,
    legCount: candidates.length,
    selectionIds: candidates.map((candidate) => candidate.id),
    fixtureIds,
    combinedOdds: round(combinedOdds, 4),
    combinedProbability: round(combinedProbability, 8),
    expectedReturnMultiple: round(expectedReturnMultiple, 8),
    score: round(
      Math.log(Math.max(combinedProbability, 1e-9))
      + candidates.reduce((sum, candidate) => sum + candidate.expectedValue + candidate.edge * 0.5, 0),
      8,
    ),
    independenceAssumption: "guarded_product" as const,
  };
}

export function generateCouponAlternatives(candidates: CouponCandidate[]) {
  const pool = [...candidates]
    .filter((candidate) => {
      try {
        validateCandidate(candidate);
        return candidate.recommendationEligible;
      } catch {
        return false;
      }
    })
    .sort(candidateSort)
    .slice(0, COUPON_POLICY.candidatePoolLimit);
  const singles = pool.slice(0, 5).map((candidate) => ({
    candidate,
    score: round(candidate.expectedValue + candidate.edge + candidate.modelProbability * 0.1, 8),
  }));
  const balanced = combinations(pool, COUPON_POLICY.balancedLegs)
    .map((legs) => ({ legs, evaluation: evaluateCoupon(legs, "balanced") }))
    .filter((item) => item.evaluation.eligible)
    .sort(couponSort)
    .slice(0, COUPON_POLICY.maximumAlternativesPerTier);
  const highOdds = [] as Array<{ legs: CouponCandidate[]; evaluation: ReturnType<typeof evaluateCoupon> }>;
  for (let size = COUPON_POLICY.highOddsMinimumLegs; size <= COUPON_POLICY.highOddsMaximumLegs; size += 1) {
    for (const legs of combinations(pool, size)) {
      const evaluation = evaluateCoupon(legs, "high_odds");
      if (evaluation.eligible && evaluation.combinedOdds >= COUPON_POLICY.highOddsTarget) {
        highOdds.push({ legs, evaluation });
      }
    }
  }
  highOdds.sort(couponSort);
  return {
    schemaVersion: COUPON_ENGINE_SCHEMA_VERSION,
    policy: COUPON_POLICY,
    candidateCount: pool.length,
    singles,
    balanced,
    highOdds: highOdds.slice(0, COUPON_POLICY.maximumAlternativesPerTier),
  };
}

function validateCandidate(candidate: CouponCandidate) {
  if (!candidate?.id?.trim() || !candidate.fixtureId?.trim() || !candidate.leagueId?.trim()
    || !candidate.homeTeamId?.trim() || !candidate.awayTeamId?.trim()) {
    throw new ModelLabValidationError("Coupon candidate identity is incomplete.");
  }
  if (!( ["1", "X", "2"] as string[]).includes(candidate.selection)) {
    throw new ModelLabValidationError("Coupon selection is invalid.");
  }
  if (!Number.isFinite(candidate.modelProbability)
    || candidate.modelProbability <= 0
    || candidate.modelProbability >= 1
    || !Number.isFinite(candidate.decimalOdds)
    || candidate.decimalOdds < 1.01
    || !Number.isFinite(candidate.expectedValue)
    || !Number.isFinite(candidate.edge)) {
    throw new ModelLabValidationError("Coupon candidate metrics are invalid.");
  }
}

function combinations<T>(values: T[], size: number): T[][] {
  if (size <= 0 || size > values.length) return [];
  const result: T[][] = [];
  const visit = (start: number, selected: T[]) => {
    if (selected.length === size) {
      result.push([...selected]);
      return;
    }
    for (let index = start; index <= values.length - (size - selected.length); index += 1) {
      selected.push(values[index]);
      visit(index + 1, selected);
      selected.pop();
    }
  };
  visit(0, []);
  return result;
}

function candidateSort(first: CouponCandidate, second: CouponCandidate) {
  return second.expectedValue - first.expectedValue
    || second.edge - first.edge
    || second.modelProbability - first.modelProbability
    || first.id.localeCompare(second.id);
}

function couponSort(
  first: { evaluation: ReturnType<typeof evaluateCoupon> },
  second: { evaluation: ReturnType<typeof evaluateCoupon> },
) {
  return second.evaluation.score - first.evaluation.score
    || Math.abs(first.evaluation.combinedOdds - COUPON_POLICY.highOddsTarget)
      - Math.abs(second.evaluation.combinedOdds - COUPON_POLICY.highOddsTarget)
    || first.evaluation.selectionIds.join("|").localeCompare(second.evaluation.selectionIds.join("|"));
}

function countBy(values: string[]) {
  const result = new Map<string, number>();
  for (const value of values) result.set(value, (result.get(value) ?? 0) + 1);
  return result;
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
