export type AutomationHealthRun = {
  status: "running" | "completed" | "partial" | "failed";
  startedAt: string;
  completedAt: string | null;
};

export type AutomationHealth = {
  status: "not_started" | "running" | "healthy" | "degraded" | "stale";
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  consecutiveFailures: number;
  successRate: number | null;
  averageDurationMs: number | null;
  maximumDurationMs: number | null;
  lastStartedAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
};

export type ResearchOperationsGate = {
  status: "blocked" | "watch" | "operational";
  healthyWorkers: number;
  workerCount: 2;
  blockerCodes: string[];
  researchOnly: true;
  recommendationEligible: false;
};

export function evaluateResearchOperationsGate(
  forward: AutomationHealth,
  historical: AutomationHealth,
): ResearchOperationsGate {
  const workers = [
    ["FORWARD", forward],
    ["HISTORICAL", historical],
  ] as const;
  const blockerCodes = workers.flatMap(([prefix, health]) => {
    if (health.status === "not_started") return [`${prefix}_NOT_STARTED`];
    if (health.status === "stale") return [`${prefix}_STALE`];
    if (health.status === "degraded") return [`${prefix}_DEGRADED`];
    return [];
  });
  const hardBlocked = workers.some(([, health]) => health.status === "not_started" || health.status === "stale");
  const degraded = workers.some(([, health]) => health.status === "degraded");

  return {
    status: hardBlocked ? "blocked" : degraded ? "watch" : "operational",
    healthyWorkers: workers.filter(([, health]) => health.status === "healthy" || health.status === "running").length,
    workerCount: 2,
    blockerCodes,
    researchOnly: true,
    recommendationEligible: false,
  };
}

export function summarizeAutomationHealth(
  runs: AutomationHealthRun[],
  nowIso = new Date().toISOString(),
  staleAfterMinutes = 135,
): AutomationHealth {
  const ordered = [...runs].sort((first, second) => second.startedAt.localeCompare(first.startedAt));
  const terminal = ordered.filter((run) => run.status !== "running");
  const completed = terminal.filter((run) => run.status === "completed");
  const failed = terminal.filter((run) => run.status === "failed" || run.status === "partial");
  const durations = terminal.flatMap((run) => {
    if (!run.completedAt) return [];
    const duration = Date.parse(run.completedAt) - Date.parse(run.startedAt);
    return Number.isFinite(duration) && duration >= 0 ? [duration] : [];
  });
  let consecutiveFailures = 0;
  for (const run of terminal) {
    if (run.status === "completed") break;
    consecutiveFailures += 1;
  }
  const latest = ordered[0];
  const now = Date.parse(nowIso);
  const latestAge = latest ? now - Date.parse(latest.startedAt) : Number.POSITIVE_INFINITY;
  const staleAfterMs = staleAfterMinutes * 60_000;
  const status = !latest
    ? "not_started"
    : latest.status === "running" && latestAge <= 45 * 60_000
      ? "running"
      : latest.status === "running" || latestAge > staleAfterMs
        ? "stale"
        : consecutiveFailures > 0
          ? "degraded"
          : "healthy";

  return {
    status,
    totalRuns: ordered.length,
    completedRuns: completed.length,
    failedRuns: failed.length,
    consecutiveFailures,
    successRate: terminal.length ? completed.length / terminal.length : null,
    averageDurationMs: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null,
    maximumDurationMs: durations.length ? Math.max(...durations) : null,
    lastStartedAt: latest?.startedAt ?? null,
    lastSuccessAt: completed[0]?.completedAt ?? null,
    lastFailureAt: failed[0]?.completedAt ?? null,
  };
}
