import type { NormalizedFootballPayload } from "@/lib/import-contract";

export type DataQualityIssue = {
  severity: "warning" | "error";
  code: string;
  entityType: "dataset" | "fixture" | "team" | "alias" | "source" | "odds";
  entityKey?: string;
  field?: string;
  message: string;
  details?: Record<string, unknown>;
};

export type DataQualityReport = {
  grade: "A" | "B" | "C" | "D";
  qualityScore: number;
  completenessScore: number;
  consistencyScore: number;
  freshnessScore: number;
  advancedCoverage: number;
  warningCount: number;
  errorCount: number;
  recommendationEligible: boolean;
  issues: DataQualityIssue[];
};

type QualityContext = {
  capturedAt: string;
  externalIssues?: DataQualityIssue[];
};

export function evaluatePayloadQuality(
  payload: NormalizedFootballPayload,
  context: QualityContext,
): DataQualityReport {
  const issues = [...(context.externalIssues ?? [])];
  const fixtures = payload.fixtures;
  const expectedStatRows = Math.max(fixtures.length * 2, 1);
  const statRows = payload.stats.length;
  const statFields = payload.stats.flatMap((row) => [
    row.possession,
    row.shots,
    row.shotsOnTarget,
    row.expectedGoals,
    row.dangerousAttacks,
    row.penaltyAreaEntries,
    row.ppda,
    row.bigChancesAllowed,
  ]);
  const suppliedStatFields = statFields.filter((value) => value != null).length;
  const totalStatFields = Math.max(expectedStatRows * 8, 1);
  const advancedCoverage = clamp(suppliedStatFields / totalStatFields, 0, 1);
  const statsRowCoverage = clamp(statRows / expectedStatRows, 0, 1);
  const oddsCoverage = fixtures.length
    ? clamp(new Set(payload.odds.map((row) => row.fixtureId)).size / fixtures.length, 0, 1)
    : 0;

  if (!fixtures.length) {
    issues.push(issue("error", "NO_FIXTURES", "dataset", "İçe aktarma en az bir fikstür içermelidir."));
  }
  if (statsRowCoverage < 1) {
    issues.push(issue(
      "warning",
      "STATS_ROWS_INCOMPLETE",
      "dataset",
      `Beklenen ${fixtures.length * 2} takım-istatistik satırının ${statRows} tanesi mevcut.`,
      { expected: fixtures.length * 2, actual: statRows },
    ));
  }
  if (advancedCoverage < 0.7) {
    issues.push(issue(
      "warning",
      "ADVANCED_COVERAGE_LOW",
      "dataset",
      `Gelişmiş istatistik kapsamı %${Math.round(advancedCoverage * 100)}; bahis önerisi için en az %70 gerekli.`,
      { advancedCoverage },
    ));
  }
  if (oddsCoverage < 0.5) {
    issues.push(issue(
      "warning",
      "ODDS_COVERAGE_LOW",
      "dataset",
      `Fikstürlerin yalnızca %${Math.round(oddsCoverage * 100)} kadarı oran verisi içeriyor.`,
      { oddsCoverage },
    ));
  }

  const statsByFixture = new Map<string, typeof payload.stats>();
  for (const stat of payload.stats) {
    const rows = statsByFixture.get(stat.fixtureId) ?? [];
    rows.push(stat);
    statsByFixture.set(stat.fixtureId, rows);
    const key = `${stat.fixtureId}:${stat.teamId}`;
    if (stat.shots != null && stat.shotsOnTarget != null && stat.shotsOnTarget > stat.shots) {
      issues.push(issue("error", "SHOTS_ON_TARGET_GT_SHOTS", "fixture", "İsabetli şut toplam şuttan büyük olamaz.", { shots: stat.shots, shotsOnTarget: stat.shotsOnTarget }, key, "shotsOnTarget"));
    }
    for (const [field, value] of Object.entries(stat)) {
      if (typeof value === "number" && value < 0) {
        issues.push(issue("error", "NEGATIVE_STAT", "fixture", `${field} negatif olamaz.`, { value }, key, field));
      }
    }
  }

  for (const fixture of fixtures) {
    if (fixture.status === "finished" && (fixture.homeScore == null || fixture.awayScore == null)) {
      issues.push(issue("error", "FINISHED_SCORE_MISSING", "fixture", "Biten maçta iki skor da bulunmalıdır.", undefined, fixture.id, "score"));
    }
    const rows = statsByFixture.get(fixture.id) ?? [];
    if (rows.length === 2 && rows.every((row) => row.possession != null)) {
      const total = (rows[0].possession ?? 0) + (rows[1].possession ?? 0);
      if (total < 95 || total > 105) {
        issues.push(issue("warning", "POSSESSION_TOTAL_OFF", "fixture", `Topa sahip olma toplamı %${round(total)}; beklenen aralık %95–105.`, { total }, fixture.id, "possession"));
      }
    }
  }

  const fixtureById = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  const oddsGroups = new Map<string, typeof payload.odds>();
  const importCapturedMs = Date.parse(context.capturedAt);
  for (const odd of payload.odds) {
    const fixture = fixtureById.get(odd.fixtureId);
    const capturedMs = Date.parse(odd.capturedAt);
    if (Number.isFinite(importCapturedMs) && capturedMs > importCapturedMs + 60_000) {
      issues.push(issue(
        "error",
        "ODDS_AFTER_IMPORT_CAPTURE",
        "odds",
        "Oran zamanı import snapshot zamanından sonra olamaz.",
        { oddsCapturedAt: odd.capturedAt, importCapturedAt: context.capturedAt },
        odd.id,
        "capturedAt",
      ));
    }
    if (fixture && capturedMs >= Date.parse(fixture.kickoffAt)) {
      issues.push(issue(
        "error",
        "ODDS_AT_OR_AFTER_KICKOFF",
        "odds",
        "Maç başladıktan sonra alınan oran tahmin veya değer kanıtı olamaz.",
        { oddsCapturedAt: odd.capturedAt, kickoffAt: fixture.kickoffAt },
        odd.id,
        "capturedAt",
      ));
    }
    if (odd.market === "1X2") {
      const key = `${odd.fixtureId}|${odd.bookmaker}|${odd.capturedAt}`;
      oddsGroups.set(key, [...(oddsGroups.get(key) ?? []), odd]);
    }
  }
  for (const [key, group] of oddsGroups) {
    const selections = new Map(group.map((odd) => [odd.selection.toUpperCase(), odd]));
    const home = selections.get("1");
    const draw = selections.get("X");
    const away = selections.get("2");
    if (!home || !draw || !away) {
      issues.push(issue(
        "warning",
        "ODDS_1X2_GROUP_INCOMPLETE",
        "odds",
        "Aynı bookmaker ve capture zamanı için 1-X-2 üçlüsü eksiksiz olmalıdır.",
        { selections: [...selections.keys()].sort() },
        key,
      ));
      continue;
    }
    const impliedTotal = 1 / home.decimalOdds + 1 / draw.decimalOdds + 1 / away.decimalOdds;
    const overround = impliedTotal - 1;
    if (overround < 0 || overround > 0.25) {
      issues.push(issue(
        "warning",
        "ODDS_OVERROUND_OUTLIER",
        "odds",
        "Bookmaker marjı beklenen %0–25 aralığının dışında; grup değer hesabından çıkarılır.",
        { overround: round(overround) },
        key,
      ));
    }
  }

  const completenessScore = Math.round(100 * (
    0.6 * advancedCoverage
    + 0.25 * statsRowCoverage
    + 0.15 * oddsCoverage
  ));
  const consistencyPenalty = issues.reduce((total, item) => total + (item.severity === "error" ? 18 : 5), 0);
  const consistencyScore = clamp(Math.round(100 - consistencyPenalty), 0, 100);
  const freshnessScore = freshness(context.capturedAt, issues);
  const qualityScore = clamp(Math.round(
    completenessScore * 0.55 + consistencyScore * 0.3 + freshnessScore * 0.15,
  ), 0, 100);
  const errorCount = issues.filter((item) => item.severity === "error").length;
  const warningCount = issues.length - errorCount;
  const grade = qualityScore >= 90 ? "A" : qualityScore >= 78 ? "B" : qualityScore >= 60 ? "C" : "D";
  const hasMappingReview = issues.some((item) => item.code === "TEAM_ALIAS_REVIEW" || item.code === "FIXTURE_MATCH_REVIEW");
  const recommendationEligible = (grade === "A" || grade === "B")
    && advancedCoverage >= 0.7
    && errorCount === 0
    && !hasMappingReview;

  return {
    grade,
    qualityScore,
    completenessScore,
    consistencyScore,
    freshnessScore,
    advancedCoverage: round(advancedCoverage),
    warningCount,
    errorCount,
    recommendationEligible,
    issues: issues.slice(0, 250),
  };
}

function freshness(capturedAt: string, issues: DataQualityIssue[]) {
  const hours = Math.max(0, (Date.now() - new Date(capturedAt).getTime()) / 3_600_000);
  if (hours <= 24) return 100;
  if (hours <= 72) return 82;
  if (hours <= 168) return 65;
  issues.push(issue("warning", "SNAPSHOT_STALE", "dataset", `Snapshot ${Math.round(hours / 24)} günlük; güncel analiz için yeniden alınmalı.`, { ageHours: round(hours) }));
  return hours <= 720 ? 42 : 20;
}

function issue(
  severity: DataQualityIssue["severity"],
  code: string,
  entityType: DataQualityIssue["entityType"],
  message: string,
  details?: Record<string, unknown>,
  entityKey?: string,
  field?: string,
): DataQualityIssue {
  return { severity, code, entityType, message, details, entityKey, field };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
