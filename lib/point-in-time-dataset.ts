import {
  FEATURE_SCHEMA_VERSION,
  ModelLabValidationError,
  auditPointInTimeSamples,
  buildFormAdvantageFeatures,
  type BacktestSample,
  type HistoricalMatch,
  type MatchOutcome,
} from "./model-lab.ts";
import {
  BENCHMARK_SCHEMA_VERSION,
  buildBenchmarkForecast,
  type BenchmarkForecast,
  type BenchmarkFixture,
} from "./benchmark-models.ts";
import {
  ABLATION_SCHEMA_VERSION,
  buildFormAblationForecast,
  type FormAblationForecast,
} from "./evidence-lab.ts";

export const DATASET_BUILDER_VERSION = "point-in-time-d1-v3" as const;

export type DatasetFixtureRow = {
  id: string;
  leagueId: string;
  season: string;
  kickoffAt: string;
  homeTeamId: string;
  awayTeamId: string;
  status: "scheduled" | "live" | "finished" | "postponed" | "cancelled";
  homeScore: number | null;
  awayScore: number | null;
};

export type DatasetStatRow = {
  fixtureId: string;
  teamId: string;
  possession: number | null;
  shots: number | null;
  shotsOnTarget: number | null;
  expectedGoals: number | null;
  dangerousAttacks: number | null;
  penaltyAreaEntries: number | null;
  ppda: number | null;
  bigChancesAllowed: number | null;
};

export type DatasetOddsRow = {
  id: string;
  fixtureId: string;
  bookmaker: string;
  market: string;
  selection: string;
  decimalOdds: number;
  capturedAt: string;
};

export type PointInTimeDatasetConfig = {
  leagueId: string;
  predictionHorizonHours: number;
  minimumHistoryMatches: number;
  resultAvailabilityHours: number;
};

export type DatasetRejectionCode =
  | "INVALID_TARGET"
  | "INSUFFICIENT_HOME_HISTORY"
  | "INSUFFICIENT_AWAY_HISTORY"
  | "FEATURE_BUILD_FAILED";

export type PointInTimeFeaturePayload = {
  builderVersion: typeof DATASET_BUILDER_VERSION;
  featureSchemaVersion: typeof FEATURE_SCHEMA_VERSION;
  ablationSchemaVersion: typeof ABLATION_SCHEMA_VERSION;
  availabilityPolicy: "fixture_end_plus_buffer";
  resultAvailabilityHours: number;
  target: {
    fixtureId: string;
    season: string;
    homeTeamId: string;
    awayTeamId: string;
    kickoffAt: string;
    predictionAt: string;
  };
  provenance: {
    homeHistoryFixtureIds: string[];
    awayHistoryFixtureIds: string[];
    h2hFixtureIds: string[];
    benchmarkHistoryFixtureCount: number;
    benchmarkHistoryCutoffAt: string;
    benchmarkHistoryFingerprint: string;
    oddsBookmaker: string | null;
    oddsCapturedAt: string | null;
    closingOddsCapturedAt: string | null;
  };
  features: ReturnType<typeof buildFormAdvantageFeatures>;
  benchmarks: BenchmarkForecast;
  ablations: FormAblationForecast;
};

export type PointInTimeDatasetRecord = {
  sample: BacktestSample;
  featurePayload: PointInTimeFeaturePayload;
};

export type PointInTimeDatasetAudit = {
  sourceFixtureCount: number;
  finishedFixtureCount: number;
  eligibleSampleCount: number;
  rejectedSampleCount: number;
  rejectionCounts: Record<DatasetRejectionCode, number>;
  averageDataCompleteness: number;
  oddsCoverage: number;
  earliestKickoffAt: string | null;
  latestKickoffAt: string | null;
  leakageViolationCount: number;
  availabilityAssumption: string;
};

export type PointInTimeDatasetResult = {
  builderVersion: typeof DATASET_BUILDER_VERSION;
  featureSchemaVersion: typeof FEATURE_SCHEMA_VERSION;
  benchmarkSchemaVersion: typeof BENCHMARK_SCHEMA_VERSION;
  ablationSchemaVersion: typeof ABLATION_SCHEMA_VERSION;
  config: PointInTimeDatasetConfig;
  records: PointInTimeDatasetRecord[];
  samples: BacktestSample[];
  datasetChecksumSha256: string;
  audit: PointInTimeDatasetAudit;
};

type NormalizedFixture = DatasetFixtureRow & {
  kickoffMs: number;
  resultKnownMs: number;
};

type CompleteOddsGroup = {
  bookmaker: string;
  capturedAt: string;
  capturedMs: number;
  home: number;
  draw: number;
  away: number;
};

export async function buildPointInTimeDataset(input: {
  fixtures: DatasetFixtureRow[];
  stats: DatasetStatRow[];
  odds: DatasetOddsRow[];
  config: PointInTimeDatasetConfig;
}): Promise<PointInTimeDatasetResult> {
  const config = normalizeConfig(input.config);
  if (!Array.isArray(input.fixtures) || input.fixtures.length > 5_000) {
    throw new ModelLabValidationError("A dataset build accepts at most 5,000 fixtures.");
  }

  const normalized = normalizeFixtures(input.fixtures, config);
  const leagueFixtures = normalized
    .filter((fixture) => fixture.leagueId === config.leagueId)
    .sort(compareFixtures);
  const finished = leagueFixtures.filter((fixture) => fixture.status === "finished");
  const validFinished = finished.filter(isValidFinishedFixture);
  const teamFixtures = indexTeamFixtures(validFinished);
  const statsByFixtureTeam = indexStats(input.stats);
  const oddsByFixture = indexOdds(input.odds);
  const rejectionCounts = emptyRejectionCounts();
  const records: PointInTimeDatasetRecord[] = [];

  for (const target of finished) {
    if (!isValidFinishedFixture(target)) {
      rejectionCounts.INVALID_TARGET += 1;
      continue;
    }
    const predictionMs = target.kickoffMs - config.predictionHorizonHours * 3_600_000;
    if (!Number.isFinite(predictionMs) || target.resultKnownMs <= predictionMs) {
      rejectionCounts.INVALID_TARGET += 1;
      continue;
    }

    const homeRows = historicalFixturesForTeam(teamFixtures, target.homeTeamId, predictionMs, 10);
    const awayRows = historicalFixturesForTeam(teamFixtures, target.awayTeamId, predictionMs, 10);
    if (homeRows.length < config.minimumHistoryMatches) {
      rejectionCounts.INSUFFICIENT_HOME_HISTORY += 1;
      continue;
    }
    if (awayRows.length < config.minimumHistoryMatches) {
      rejectionCounts.INSUFFICIENT_AWAY_HISTORY += 1;
      continue;
    }

    const h2hRows = historicalHeadToHead(
      teamFixtures,
      target.homeTeamId,
      target.awayTeamId,
      predictionMs,
      10,
    );
    const homeHistory = homeRows.map((fixture) => toHistoricalMatch(
      fixture,
      target.homeTeamId,
      teamFixtures,
      statsByFixtureTeam,
    ));
    const awayHistory = awayRows.map((fixture) => toHistoricalMatch(
      fixture,
      target.awayTeamId,
      teamFixtures,
      statsByFixtureTeam,
    ));
    const h2hHistory = h2hRows.map((fixture) => toHistoricalMatch(
      fixture,
      target.homeTeamId,
      teamFixtures,
      statsByFixtureTeam,
    ));
    const benchmarkRows = validFinished.filter((fixture) => fixture.resultKnownMs <= predictionMs);

    try {
      const predictionAt = new Date(predictionMs).toISOString();
      const features = buildFormAdvantageFeatures({
        predictionAt,
        homeTeamId: target.homeTeamId,
        awayTeamId: target.awayTeamId,
        homeHistory,
        awayHistory,
        h2hFromHomePerspective: h2hHistory,
      });
      const ablations = buildFormAblationForecast({
        predictionAt,
        homeTeamId: target.homeTeamId,
        awayTeamId: target.awayTeamId,
        homeHistory,
        awayHistory,
        h2hFromHomePerspective: h2hHistory,
      });
      const benchmarkHistory = benchmarkRows.map(toBenchmarkFixture);
      const benchmarkHistoryFingerprint = await sha256(canonicalJson(benchmarkHistory));
      const benchmarks = buildBenchmarkForecast({
        history: benchmarkHistory,
        target: {
          fixtureId: target.id,
          predictionAt,
          kickoffAt: target.kickoffAt,
          homeTeamId: target.homeTeamId,
          awayTeamId: target.awayTeamId,
        },
      });
      const odds = chooseOdds(oddsByFixture.get(target.id) ?? [], predictionMs, target.kickoffMs);
      const featureCutoffMs = Math.max(
        ...homeRows.map((fixture) => fixture.resultKnownMs),
        ...awayRows.map((fixture) => fixture.resultKnownMs),
        Date.parse(benchmarks.historyCutoffAt),
      );
      const historyCoverage = Math.min(1, Math.min(homeRows.length, awayRows.length) / 10);
      const advancedCoverage = (features.home.advancedDataCoverage + features.away.advancedDataCoverage) / 2;
      const dataCompleteness = round(advancedCoverage * 0.8 + historyCoverage * 0.2, 8);
      const featurePayload: PointInTimeFeaturePayload = {
        builderVersion: DATASET_BUILDER_VERSION,
        featureSchemaVersion: FEATURE_SCHEMA_VERSION,
        ablationSchemaVersion: ABLATION_SCHEMA_VERSION,
        availabilityPolicy: "fixture_end_plus_buffer",
        resultAvailabilityHours: config.resultAvailabilityHours,
        target: {
          fixtureId: target.id,
          season: target.season,
          homeTeamId: target.homeTeamId,
          awayTeamId: target.awayTeamId,
          kickoffAt: target.kickoffAt,
          predictionAt,
        },
        provenance: {
          homeHistoryFixtureIds: homeRows.map((fixture) => fixture.id),
          awayHistoryFixtureIds: awayRows.map((fixture) => fixture.id),
          h2hFixtureIds: h2hRows.map((fixture) => fixture.id),
          benchmarkHistoryFixtureCount: benchmarks.historyFixtureCount,
          benchmarkHistoryCutoffAt: benchmarks.historyCutoffAt,
          benchmarkHistoryFingerprint,
          oddsBookmaker: odds.open?.bookmaker ?? null,
          oddsCapturedAt: odds.open?.capturedAt ?? null,
          closingOddsCapturedAt: odds.closing?.capturedAt ?? null,
        },
        features,
        benchmarks,
        ablations,
      };
      const featureFingerprint = await sha256(canonicalJson(featurePayload));
      const sample: BacktestSample = {
        fixtureId: target.id,
        predictionAt,
        kickoffAt: target.kickoffAt,
        featureCutoffAt: new Date(featureCutoffMs).toISOString(),
        resultKnownAt: new Date(target.resultKnownMs).toISOString(),
        actualOutcome: outcomeFor(target),
        probabilities: features.probabilities,
        odds: odds.open ? {
          home: odds.open.home,
          draw: odds.open.draw,
          away: odds.open.away,
          capturedAt: odds.open.capturedAt,
          closingHome: odds.closing?.home,
          closingDraw: odds.closing?.draw,
          closingAway: odds.closing?.away,
        } : undefined,
        dataCompleteness,
        featureFingerprint,
      };
      records.push({ sample, featurePayload });
    } catch (error) {
      if (!(error instanceof ModelLabValidationError)) throw error;
      rejectionCounts.FEATURE_BUILD_FAILED += 1;
    }
  }

  const samples = records.map((record) => record.sample);
  const violations = auditPointInTimeSamples(samples);
  if (violations.length) {
    throw new ModelLabValidationError("Generated dataset failed its point-in-time audit.", violations);
  }
  const datasetChecksumSha256 = await sha256(canonicalJson({
    builderVersion: DATASET_BUILDER_VERSION,
    featureSchemaVersion: FEATURE_SCHEMA_VERSION,
    benchmarkSchemaVersion: BENCHMARK_SCHEMA_VERSION,
    ablationSchemaVersion: ABLATION_SCHEMA_VERSION,
    config,
    samples,
  }));
  const rejectedSampleCount = Object.values(rejectionCounts).reduce((sum, count) => sum + count, 0);
  const orderedSamples = [...samples].sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt));
  const averageDataCompleteness = samples.length
    ? samples.reduce((sum, sample) => sum + sample.dataCompleteness, 0) / samples.length
    : 0;
  const oddsCount = samples.filter((sample) => sample.odds !== undefined).length;

  return {
    builderVersion: DATASET_BUILDER_VERSION,
    featureSchemaVersion: FEATURE_SCHEMA_VERSION,
    benchmarkSchemaVersion: BENCHMARK_SCHEMA_VERSION,
    ablationSchemaVersion: ABLATION_SCHEMA_VERSION,
    config,
    records,
    samples,
    datasetChecksumSha256,
    audit: {
      sourceFixtureCount: leagueFixtures.length,
      finishedFixtureCount: finished.length,
      eligibleSampleCount: samples.length,
      rejectedSampleCount,
      rejectionCounts,
      averageDataCompleteness: round(averageDataCompleteness, 8),
      oddsCoverage: samples.length ? round(oddsCount / samples.length, 8) : 0,
      earliestKickoffAt: orderedSamples[0]?.kickoffAt ?? null,
      latestKickoffAt: orderedSamples.at(-1)?.kickoffAt ?? null,
      leakageViolationCount: violations.length,
      availabilityAssumption: `Post-match results and stats are treated as available ${config.resultAvailabilityHours} hours after kickoff; every dataset remains research-only until source revision timing is proven.`,
    },
  };
}

function normalizeConfig(config: PointInTimeDatasetConfig): PointInTimeDatasetConfig {
  if (!config || typeof config !== "object" || typeof config.leagueId !== "string" || !config.leagueId.trim()) {
    throw new ModelLabValidationError("A leagueId is required for dataset generation.");
  }
  const numeric = [config.predictionHorizonHours, config.minimumHistoryMatches, config.resultAvailabilityHours];
  if (numeric.some((value) => !Number.isFinite(value))) {
    throw new ModelLabValidationError("Dataset timing and history settings must be finite numbers.");
  }
  if (!Number.isInteger(config.predictionHorizonHours) || config.predictionHorizonHours < 1 || config.predictionHorizonHours > 168) {
    throw new ModelLabValidationError("predictionHorizonHours must be an integer between 1 and 168.");
  }
  if (!Number.isInteger(config.minimumHistoryMatches) || config.minimumHistoryMatches < 3 || config.minimumHistoryMatches > 10) {
    throw new ModelLabValidationError("minimumHistoryMatches must be an integer between 3 and 10.");
  }
  if (!Number.isInteger(config.resultAvailabilityHours) || config.resultAvailabilityHours < 2 || config.resultAvailabilityHours > 8) {
    throw new ModelLabValidationError("resultAvailabilityHours must be an integer between 2 and 8.");
  }
  return { ...config, leagueId: config.leagueId.trim() };
}

function normalizeFixtures(fixtures: DatasetFixtureRow[], config: PointInTimeDatasetConfig) {
  const seen = new Set<string>();
  return fixtures.map((fixture) => {
    if (!fixture || typeof fixture.id !== "string" || !fixture.id || seen.has(fixture.id)) {
      throw new ModelLabValidationError("Dataset fixtures require unique, non-empty ids.");
    }
    seen.add(fixture.id);
    const kickoffMs = Date.parse(fixture.kickoffAt);
    if (!Number.isFinite(kickoffMs)) throw new ModelLabValidationError(`Fixture ${fixture.id} has an invalid kickoffAt.`);
    return {
      ...fixture,
      kickoffAt: new Date(kickoffMs).toISOString(),
      kickoffMs,
      resultKnownMs: kickoffMs + config.resultAvailabilityHours * 3_600_000,
    };
  });
}

function isValidFinishedFixture(fixture: NormalizedFixture): fixture is NormalizedFixture & { homeScore: number; awayScore: number } {
  return fixture.status === "finished"
    && Number.isInteger(fixture.homeScore)
    && Number.isInteger(fixture.awayScore)
    && (fixture.homeScore ?? -1) >= 0
    && (fixture.awayScore ?? -1) >= 0
    && fixture.homeTeamId !== fixture.awayTeamId;
}

function compareFixtures(first: NormalizedFixture, second: NormalizedFixture) {
  return first.kickoffMs - second.kickoffMs || first.id.localeCompare(second.id);
}

function indexTeamFixtures(fixtures: NormalizedFixture[]) {
  const result = new Map<string, NormalizedFixture[]>();
  for (const fixture of fixtures) {
    result.set(fixture.homeTeamId, [...(result.get(fixture.homeTeamId) ?? []), fixture]);
    result.set(fixture.awayTeamId, [...(result.get(fixture.awayTeamId) ?? []), fixture]);
  }
  for (const rows of result.values()) rows.sort(compareFixtures);
  return result;
}

function historicalFixturesForTeam(
  teamFixtures: Map<string, NormalizedFixture[]>,
  teamId: string,
  availableAtMs: number,
  limit: number,
) {
  const result: NormalizedFixture[] = [];
  const rows = teamFixtures.get(teamId) ?? [];
  for (let index = rows.length - 1; index >= 0 && result.length < limit; index -= 1) {
    const fixture = rows[index];
    if (fixture.resultKnownMs <= availableAtMs) result.push(fixture);
  }
  return result;
}

function historicalHeadToHead(
  teamFixtures: Map<string, NormalizedFixture[]>,
  homeTeamId: string,
  awayTeamId: string,
  availableAtMs: number,
  limit: number,
) {
  return historicalFixturesForTeam(teamFixtures, homeTeamId, availableAtMs, 100)
    .filter((fixture) => fixture.homeTeamId === awayTeamId || fixture.awayTeamId === awayTeamId)
    .slice(0, limit);
}

function indexStats(rows: DatasetStatRow[]) {
  const result = new Map<string, DatasetStatRow>();
  for (const row of rows) {
    const key = `${row.fixtureId}|${row.teamId}`;
    if (result.has(key)) throw new ModelLabValidationError(`Duplicate stat row for ${key}.`);
    result.set(key, row);
  }
  return result;
}

function toHistoricalMatch(
  fixture: NormalizedFixture,
  teamId: string,
  teamFixtures: Map<string, NormalizedFixture[]>,
  stats: Map<string, DatasetStatRow>,
): HistoricalMatch {
  const isHome = fixture.homeTeamId === teamId;
  const opponentId = isHome ? fixture.awayTeamId : fixture.homeTeamId;
  const goalsFor = isHome ? fixture.homeScore ?? 0 : fixture.awayScore ?? 0;
  const goalsAgainst = isHome ? fixture.awayScore ?? 0 : fixture.homeScore ?? 0;
  const own = stats.get(`${fixture.id}|${teamId}`);
  const opponent = stats.get(`${fixture.id}|${opponentId}`);
  return {
    fixtureId: fixture.id,
    kickoffAt: fixture.kickoffAt,
    resultKnownAt: new Date(fixture.resultKnownMs).toISOString(),
    venue: isHome ? "home" : "away",
    result: goalsFor > goalsAgainst ? "win" : goalsFor === goalsAgainst ? "draw" : "loss",
    goalsFor,
    goalsAgainst,
    opponentStrength: priorPointsStrength(teamFixtures, opponentId, fixture.kickoffMs),
    expectedGoalsFor: finiteOrUndefined(own?.expectedGoals),
    expectedGoalsAgainst: finiteOrUndefined(opponent?.expectedGoals),
    shotsFor: finiteOrUndefined(own?.shots),
    shotsAgainst: finiteOrUndefined(opponent?.shots),
    shotsOnTargetFor: finiteOrUndefined(own?.shotsOnTarget),
    shotsOnTargetAgainst: finiteOrUndefined(opponent?.shotsOnTarget),
    possessionFor: finiteOrUndefined(own?.possession),
    possessionAgainst: finiteOrUndefined(opponent?.possession),
    dangerousAttacksFor: finiteOrUndefined(own?.dangerousAttacks),
    dangerousAttacksAgainst: finiteOrUndefined(opponent?.dangerousAttacks),
    penaltyAreaEntriesFor: finiteOrUndefined(own?.penaltyAreaEntries),
    penaltyAreaEntriesAgainst: finiteOrUndefined(opponent?.penaltyAreaEntries),
    ppdaFor: finiteOrUndefined(own?.ppda),
    ppdaAgainst: finiteOrUndefined(opponent?.ppda),
    bigChancesCreated: finiteOrUndefined(opponent?.bigChancesAllowed),
    bigChancesAllowed: finiteOrUndefined(own?.bigChancesAllowed),
  };
}

function toBenchmarkFixture(
  fixture: NormalizedFixture & { homeScore: number; awayScore: number },
): BenchmarkFixture {
  return {
    fixtureId: fixture.id,
    kickoffAt: fixture.kickoffAt,
    resultKnownAt: new Date(fixture.resultKnownMs).toISOString(),
    homeTeamId: fixture.homeTeamId,
    awayTeamId: fixture.awayTeamId,
    homeScore: fixture.homeScore,
    awayScore: fixture.awayScore,
  };
}

function priorPointsStrength(teamFixtures: Map<string, NormalizedFixture[]>, teamId: string, beforeMs: number) {
  const rows = historicalFixturesForTeam(teamFixtures, teamId, beforeMs, 10);
  if (!rows.length) return 0.5;
  const points = rows.reduce((sum, fixture) => {
    const isHome = fixture.homeTeamId === teamId;
    const own = isHome ? fixture.homeScore ?? 0 : fixture.awayScore ?? 0;
    const opponent = isHome ? fixture.awayScore ?? 0 : fixture.homeScore ?? 0;
    return sum + (own > opponent ? 3 : own === opponent ? 1 : 0);
  }, 0);
  return round(points / (rows.length * 3), 6);
}

function indexOdds(rows: DatasetOddsRow[]) {
  const result = new Map<string, DatasetOddsRow[]>();
  for (const row of rows) {
    if (row.market.toUpperCase() !== "1X2") continue;
    result.set(row.fixtureId, [...(result.get(row.fixtureId) ?? []), row]);
  }
  return result;
}

function chooseOdds(rows: DatasetOddsRow[], predictionMs: number, kickoffMs: number) {
  const groups = completeOddsGroups(rows);
  const open = groups
    .filter((group) => group.capturedMs <= predictionMs)
    .sort(compareOddsGroupsNewestFirst)[0] ?? null;
  const closing = open ? groups
    .filter((group) => group.bookmaker === open.bookmaker && group.capturedMs < kickoffMs)
    .sort(compareOddsGroupsNewestFirst)[0] ?? null : null;
  return { open, closing };
}

function compareOddsGroupsNewestFirst(first: CompleteOddsGroup, second: CompleteOddsGroup) {
  return second.capturedMs - first.capturedMs || first.bookmaker.localeCompare(second.bookmaker);
}

function completeOddsGroups(rows: DatasetOddsRow[]): CompleteOddsGroup[] {
  const groups = new Map<string, Map<string, DatasetOddsRow>>();
  for (const row of rows) {
    const capturedMs = Date.parse(row.capturedAt);
    if (!Number.isFinite(capturedMs) || !Number.isFinite(row.decimalOdds) || row.decimalOdds <= 1) continue;
    const selection = row.selection.toUpperCase();
    if (!(["1", "X", "2"] as string[]).includes(selection)) continue;
    const key = `${row.bookmaker}|${new Date(capturedMs).toISOString()}`;
    const selections = groups.get(key) ?? new Map<string, DatasetOddsRow>();
    const existing = selections.get(selection);
    if (!existing || row.id.localeCompare(existing.id) > 0) selections.set(selection, row);
    groups.set(key, selections);
  }
  const complete: CompleteOddsGroup[] = [];
  for (const [key, selections] of groups) {
    const home = selections.get("1");
    const draw = selections.get("X");
    const away = selections.get("2");
    if (!home || !draw || !away) continue;
    const capturedMs = Date.parse(home.capturedAt);
    complete.push({
      bookmaker: key.slice(0, key.lastIndexOf("|")),
      capturedAt: new Date(capturedMs).toISOString(),
      capturedMs,
      home: home.decimalOdds,
      draw: draw.decimalOdds,
      away: away.decimalOdds,
    });
  }
  return complete;
}

function outcomeFor(fixture: NormalizedFixture): MatchOutcome {
  if ((fixture.homeScore ?? 0) > (fixture.awayScore ?? 0)) return "1";
  if (fixture.homeScore === fixture.awayScore) return "X";
  return "2";
}

function emptyRejectionCounts(): Record<DatasetRejectionCode, number> {
  return {
    INVALID_TARGET: 0,
    INSUFFICIENT_HOME_HISTORY: 0,
    INSUFFICIENT_AWAY_HISTORY: 0,
    FEATURE_BUILD_FAILED: 0,
  };
}

function finiteOrUndefined(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function canonicalDatasetJson(value: unknown): string {
  return canonicalJson(value);
}

function canonicalJson(value: unknown): string {
  if (value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([first], [second]) => first.localeCompare(second));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
