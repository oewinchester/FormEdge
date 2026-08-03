import { ModelLabValidationError, type MatchOutcome } from "./model-lab.ts";

export type SettlementStatus = "won" | "lost" | "void" | "withdrawn";

export type PerformanceRow = {
  settlementStatus: SettlementStatus;
  leagueLabel: string;
  market: string;
  settledAt: string;
};

export function actualOutcomeForFixture(input: {
  status: "scheduled" | "live" | "finished" | "postponed" | "cancelled";
  homeScore: number | null;
  awayScore: number | null;
}): MatchOutcome | "void" | null {
  if (input.status === "cancelled") return "void";
  if (input.status !== "finished") return null;
  if (!Number.isInteger(input.homeScore) || !Number.isInteger(input.awayScore)
    || (input.homeScore ?? -1) < 0 || (input.awayScore ?? -1) < 0) {
    throw new ModelLabValidationError("A finished fixture requires valid non-negative integer scores.");
  }
  if (input.homeScore! > input.awayScore!) return "1";
  if (input.homeScore === input.awayScore) return "X";
  return "2";
}

export function settlementStatusFor(input: {
  predictedOutcome: MatchOutcome;
  actualOutcome: MatchOutcome | "void";
  withdrawnBeforeKickoff: boolean;
}): SettlementStatus {
  if (input.withdrawnBeforeKickoff) return "withdrawn";
  if (input.actualOutcome === "void") return "void";
  return input.predictedOutcome === input.actualOutcome ? "won" : "lost";
}

export function summarizePerformance(rows: PerformanceRow[]) {
  const counts = { published: rows.length, won: 0, lost: 0, void: 0, withdrawn: 0 };
  const byLeague = new Map<string, typeof counts>();
  const byMarket = new Map<string, typeof counts>();
  const byMonth = new Map<string, typeof counts>();

  for (const row of rows) {
    counts[row.settlementStatus] += 1;
    incrementGroup(byLeague, row.leagueLabel, row.settlementStatus);
    incrementGroup(byMarket, row.market, row.settlementStatus);
    const date = new Date(row.settledAt);
    incrementGroup(
      byMonth,
      Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 7) : "unknown",
      row.settlementStatus,
    );
  }

  const decided = counts.won + counts.lost;
  return {
    counts,
    decided,
    hitRate: decided ? round(counts.won / decided, 8) : null,
    byLeague: mapGroups(byLeague),
    byMarket: mapGroups(byMarket),
    byMonth: mapGroups(byMonth),
  };
}

function incrementGroup(
  target: Map<string, { published: number; won: number; lost: number; void: number; withdrawn: number }>,
  key: string,
  status: SettlementStatus,
) {
  const value = target.get(key) ?? { published: 0, won: 0, lost: 0, void: 0, withdrawn: 0 };
  value.published += 1;
  value[status] += 1;
  target.set(key, value);
}

function mapGroups(target: Map<string, { published: number; won: number; lost: number; void: number; withdrawn: number }>) {
  return [...target.entries()]
    .map(([key, value]) => {
      const decided = value.won + value.lost;
      return { key, ...value, hitRate: decided ? round(value.won / decided, 8) : null };
    })
    .sort((first, second) => second.published - first.published || first.key.localeCompare(second.key));
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
