export const LEAGUE_ONBOARDING_SCHEMA_VERSION = "league-onboarding-quality-v1" as const;

export type LeagueOnboardingState = "blocked" | "review" | "ready_for_research";
export type LeagueOnboardingGrade = "A" | "B" | "C" | "D";
export type LeagueOnboardingComponentId =
  | "license"
  | "history_depth"
  | "identity_mapping"
  | "advanced_data"
  | "lineup_coverage"
  | "odds_timestamp"
  | "source_sla";

export type LeagueOnboardingEvidence = {
  evaluatedAt: string;
  league: { id: string; name: string; countryCode: string; coverageLevel: string; active: boolean };
  source: {
    id: string;
    name: string;
    legalStatus: "approved" | "review" | "blocked";
    acquisitionMethod: "manual_export" | "public_dataset" | "licensed_feed";
    active: boolean;
  };
  history: { fixtureCount: number; finishedFixtureCount: number; seasonCount: number };
  identity: {
    aliasTotal: number;
    aliasMatched: number;
    fixtureMappingTotal: number;
    fixtureMappingMatched: number;
  };
  advancedData: { expectedFieldCount: number; suppliedFieldCount: number };
  lineups: { eligibleFixtureCount: number; fullyCoveredFixtureCount: number };
  odds: {
    fixtureCount: number;
    coveredFixtureCount: number;
    snapshotCount: number;
    preKickoffSnapshotCount: number;
  };
  sourceSla: {
    runCount: number;
    completedRunCount: number;
    failedRunCount: number;
    lastSuccessfulAt: string | null;
  };
};

export type LeagueOnboardingComponent = {
  id: LeagueOnboardingComponentId;
  label: string;
  weight: number;
  score: number;
  weightedPoints: number;
  status: "pass" | "warn" | "fail";
  summary: string;
};

export type LeagueOnboardingManifest = {
  schemaVersion: typeof LEAGUE_ONBOARDING_SCHEMA_VERSION;
  evaluatedAt: string;
  leagueId: string;
  sourceId: string;
  score: number;
  grade: LeagueOnboardingGrade;
  state: LeagueOnboardingState;
  components: LeagueOnboardingComponent[];
  blockerCodes: string[];
  warningCodes: string[];
  evidence: LeagueOnboardingEvidence;
  policy: {
    readyThreshold: 80;
    researchOnly: true;
    recommendationEligible: false;
    scoreCanOpenRecommendationGate: false;
    blockersFailClosed: true;
  };
};

const WEIGHTS: Record<LeagueOnboardingComponentId, number> = {
  license: 20,
  history_depth: 20,
  identity_mapping: 15,
  advanced_data: 15,
  lineup_coverage: 10,
  odds_timestamp: 10,
  source_sla: 10,
};

export async function buildLeagueOnboardingAssessment(rawEvidence: LeagueOnboardingEvidence) {
  const evidence = normalizeEvidence(rawEvidence);
  const blockers = new Set<string>();
  const warnings = new Set<string>();

  const licenseScore = !evidence.source.active || !evidence.league.active
    ? 0
    : evidence.source.legalStatus === "approved"
      ? 100
      : evidence.source.legalStatus === "review" ? 35 : 0;
  if (!evidence.source.active) blockers.add("SOURCE_INACTIVE");
  if (!evidence.league.active) blockers.add("LEAGUE_INACTIVE");
  if (evidence.source.legalStatus !== "approved") blockers.add("SOURCE_LICENSE_UNAPPROVED");

  const historyFixtureRatio = ratio(evidence.history.finishedFixtureCount, 200);
  const historySeasonRatio = ratio(evidence.history.seasonCount, 2);
  const historyScore = percent(historyFixtureRatio * 0.8 + historySeasonRatio * 0.2);
  if (evidence.history.finishedFixtureCount < 40 || evidence.history.seasonCount < 1) {
    blockers.add("HISTORY_DEPTH_INSUFFICIENT");
  }

  const aliasCoverage = coverage(evidence.identity.aliasMatched, evidence.identity.aliasTotal);
  const fixtureMappingCoverage = coverage(
    evidence.identity.fixtureMappingMatched,
    evidence.identity.fixtureMappingTotal,
  );
  const identityScore = percent(aliasCoverage * 0.6 + fixtureMappingCoverage * 0.4);
  if (identityScore < 95) blockers.add("IDENTITY_MAPPING_INCOMPLETE");

  const advancedCoverage = coverage(
    evidence.advancedData.suppliedFieldCount,
    evidence.advancedData.expectedFieldCount,
  );
  const advancedScore = percent(advancedCoverage);
  if (advancedScore < 70) blockers.add("ADVANCED_DATA_COVERAGE_LOW");

  const lineupCoverage = coverage(
    evidence.lineups.fullyCoveredFixtureCount,
    evidence.lineups.eligibleFixtureCount,
  );
  const lineupScore = percent(lineupCoverage);
  if (lineupScore < 50) warnings.add("LINEUP_COVERAGE_LOW");

  const oddsFixtureCoverage = coverage(
    evidence.odds.coveredFixtureCount,
    evidence.odds.fixtureCount,
  );
  const oddsTimestampIntegrity = coverage(
    evidence.odds.preKickoffSnapshotCount,
    evidence.odds.snapshotCount,
  );
  const oddsScore = percent(oddsFixtureCoverage * 0.7 + oddsTimestampIntegrity * 0.3);
  if (oddsScore < 60) blockers.add("ODDS_TIMESTAMP_COVERAGE_LOW");

  const completedAndFailed = evidence.sourceSla.completedRunCount + evidence.sourceSla.failedRunCount;
  const reliability = coverage(evidence.sourceSla.completedRunCount, completedAndFailed);
  const freshness = freshnessScore(evidence.sourceSla.lastSuccessfulAt, evidence.evaluatedAt);
  const sourceSlaScore = percent(reliability * 0.6 + freshness * 0.4);
  if (evidence.sourceSla.runCount < 3) warnings.add("SOURCE_SLA_SAMPLE_SMALL");
  if (evidence.sourceSla.runCount < 3 || evidence.sourceSla.completedRunCount === 0 || sourceSlaScore < 70) {
    blockers.add("SOURCE_SLA_UNPROVEN");
  }

  const components = [
    component("license", "Lisans ve kaynak durumu", licenseScore,
      `${evidence.source.legalStatus} · ${evidence.source.acquisitionMethod}`),
    component("history_depth", "Geçmiş derinliği", historyScore,
      `${evidence.history.finishedFixtureCount} bitmiş maç · ${evidence.history.seasonCount} sezon`),
    component("identity_mapping", "Kimlik eşleme", identityScore,
      `${evidence.identity.aliasMatched}/${evidence.identity.aliasTotal} takım · ${evidence.identity.fixtureMappingMatched}/${evidence.identity.fixtureMappingTotal} fikstür`),
    component("advanced_data", "Gelişmiş veri kapsamı", advancedScore,
      `${evidence.advancedData.suppliedFieldCount}/${evidence.advancedData.expectedFieldCount} alan`),
    component("lineup_coverage", "Kadro kapsamı", lineupScore,
      `${evidence.lineups.fullyCoveredFixtureCount}/${evidence.lineups.eligibleFixtureCount} tam fikstür`),
    component("odds_timestamp", "Oran zaman bütünlüğü", oddsScore,
      `${evidence.odds.coveredFixtureCount}/${evidence.odds.fixtureCount} fikstür · ${evidence.odds.preKickoffSnapshotCount}/${evidence.odds.snapshotCount} kickoff öncesi satır`),
    component("source_sla", "Kaynak SLA", sourceSlaScore,
      `${evidence.sourceSla.completedRunCount} başarılı · ${evidence.sourceSla.failedRunCount} başarısız run`),
  ];
  const score = clamp(Math.round(components.reduce((sum, item) => sum + item.weightedPoints, 0)), 0, 100);
  const blockerCodes = [...blockers].sort();
  const warningCodes = [...warnings].sort();
  const state: LeagueOnboardingState = blockerCodes.length
    ? "blocked"
    : score >= 80 ? "ready_for_research" : "review";
  const manifest: LeagueOnboardingManifest = {
    schemaVersion: LEAGUE_ONBOARDING_SCHEMA_VERSION,
    evaluatedAt: evidence.evaluatedAt,
    leagueId: evidence.league.id,
    sourceId: evidence.source.id,
    score,
    grade: grade(score),
    state,
    components,
    blockerCodes,
    warningCodes,
    evidence,
    policy: {
      readyThreshold: 80,
      researchOnly: true,
      recommendationEligible: false,
      scoreCanOpenRecommendationGate: false,
      blockersFailClosed: true,
    },
  };
  return {
    manifest,
    evidenceFingerprintSha256: await sha256(canonicalLeagueOnboardingJson(manifest)),
  };
}

export function parseLeagueOnboardingManifest(value: string): LeagueOnboardingManifest | null {
  try {
    const parsed = JSON.parse(value) as Partial<LeagueOnboardingManifest>;
    if (
      parsed.schemaVersion !== LEAGUE_ONBOARDING_SCHEMA_VERSION
      || typeof parsed.leagueId !== "string"
      || typeof parsed.sourceId !== "string"
      || typeof parsed.score !== "number"
      || !Array.isArray(parsed.components)
      || !Array.isArray(parsed.blockerCodes)
      || !parsed.policy
      || parsed.policy.researchOnly !== true
      || parsed.policy.recommendationEligible !== false
      || parsed.policy.scoreCanOpenRecommendationGate !== false
      || parsed.policy.blockersFailClosed !== true
    ) return null;
    return parsed as LeagueOnboardingManifest;
  } catch {
    return null;
  }
}

export function canonicalLeagueOnboardingJson(value: unknown): string {
  if (value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicalLeagueOnboardingJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalLeagueOnboardingJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function normalizeEvidence(value: LeagueOnboardingEvidence): LeagueOnboardingEvidence {
  const iso = new Date(value.evaluatedAt).toISOString();
  return {
    evaluatedAt: iso,
    league: {
      id: value.league.id.trim(),
      name: value.league.name.trim(),
      countryCode: value.league.countryCode.trim().toUpperCase(),
      coverageLevel: value.league.coverageLevel.trim(),
      active: Boolean(value.league.active),
    },
    source: {
      id: value.source.id.trim(),
      name: value.source.name.trim(),
      legalStatus: value.source.legalStatus,
      acquisitionMethod: value.source.acquisitionMethod,
      active: Boolean(value.source.active),
    },
    history: numericRecord(value.history),
    identity: numericRecord(value.identity),
    advancedData: numericRecord(value.advancedData),
    lineups: numericRecord(value.lineups),
    odds: numericRecord(value.odds),
    sourceSla: {
      ...numericRecord({
        runCount: value.sourceSla.runCount,
        completedRunCount: value.sourceSla.completedRunCount,
        failedRunCount: value.sourceSla.failedRunCount,
      }),
      lastSuccessfulAt: value.sourceSla.lastSuccessfulAt
        ? new Date(value.sourceSla.lastSuccessfulAt).toISOString()
        : null,
    },
  };
}

function numericRecord<T extends Record<string, number>>(value: T): T {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    Math.max(0, Number.isFinite(item) ? item : 0),
  ])) as T;
}

function component(
  id: LeagueOnboardingComponentId,
  label: string,
  score: number,
  summary: string,
): LeagueOnboardingComponent {
  const normalizedScore = clamp(Math.round(score), 0, 100);
  const failThreshold = id === "identity_mapping" ? 95
    : id === "advanced_data" ? 70
      : id === "odds_timestamp" ? 60
        : id === "source_sla" ? 70
          : id === "history_depth" ? 20
            : id === "license" ? 100 : 0;
  return {
    id,
    label,
    weight: WEIGHTS[id],
    score: normalizedScore,
    weightedPoints: round(normalizedScore * WEIGHTS[id] / 100),
    status: normalizedScore < failThreshold ? "fail" : normalizedScore < 80 ? "warn" : "pass",
    summary,
  };
}

function coverage(numerator: number, denominator: number) {
  return denominator > 0 ? clamp(numerator / denominator, 0, 1) : 0;
}

function ratio(value: number, target: number) {
  return clamp(target > 0 ? value / target : 0, 0, 1);
}

function freshnessScore(lastSuccessfulAt: string | null, evaluatedAt: string) {
  if (!lastSuccessfulAt) return 0;
  const ageHours = Math.max(0, (Date.parse(evaluatedAt) - Date.parse(lastSuccessfulAt)) / 3_600_000);
  if (!Number.isFinite(ageHours)) return 0;
  if (ageHours <= 24) return 1;
  if (ageHours <= 72) return 0.8;
  if (ageHours <= 168) return 0.55;
  if (ageHours <= 720) return 0.25;
  return 0;
}

function percent(value: number) { return clamp(Math.round(value * 100), 0, 100); }
function round(value: number) { return Math.round(value * 100) / 100; }
function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
function grade(score: number): LeagueOnboardingGrade {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  return "D";
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
