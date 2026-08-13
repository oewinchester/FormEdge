import type { DataQualityIssue } from "./data-quality.ts";
import type { AdminImportEnvelope, NormalizedFootballPayload } from "./import-contract.ts";
import { footballDataFixtureId, footballDataTeamId } from "./football-data-source.ts";

export const SPORTMONKS_ADAPTER_VERSION = "sportmonks-v3-fixtures-v7" as const;
export const SPORTMONKS_BASE_URL = "https://api.sportmonks.com/v3/football/fixtures" as const;
export const SPORTMONKS_ACCOUNT_BASE_URL = "https://api.sportmonks.com/v3/my" as const;
export const SPORTMONKS_MAX_BYTES = 32_000_000;
export const SPORTMONKS_MAX_PAGES_PER_DATE = 8;
export const SPORTMONKS_TEAM_HISTORY_DAYS = 365;

type LeagueMeta = {
  sportmonksId: number;
  code: string;
  id: string;
  countryCode: string;
  name: string;
  tier: number;
};

export const SPORTMONKS_PLAN_LEAGUES = [
  { sportmonksId: 8, code: "E0", id: "eng-premier-league", countryCode: "GB", name: "Premier League", tier: 1 },
  { sportmonksId: 9, code: "ELC", id: "eng-championship", countryCode: "GB", name: "Championship", tier: 2 },
  { sportmonksId: 72, code: "DED", id: "nl-eredivisie", countryCode: "NL", name: "Eredivisie", tier: 1 },
  { sportmonksId: 82, code: "D1", id: "de-bundesliga", countryCode: "DE", name: "Bundesliga", tier: 1 },
  { sportmonksId: 85, code: "D2", id: "de-2-bundesliga", countryCode: "DE", name: "2. Bundesliga", tier: 2 },
  { sportmonksId: 181, code: "AUT1", id: "at-bundesliga", countryCode: "AT", name: "Admiral Bundesliga", tier: 1 },
  { sportmonksId: 208, code: "BEL1", id: "be-pro-league", countryCode: "BE", name: "Pro League", tier: 1 },
  { sportmonksId: 271, code: "DEN1", id: "dk-superliga", countryCode: "DK", name: "Superliga", tier: 1 },
  { sportmonksId: 301, code: "FL1", id: "fr-ligue-1", countryCode: "FR", name: "Ligue 1", tier: 1 },
  { sportmonksId: 325, code: "GRE1", id: "gr-super-league", countryCode: "GR", name: "Super League", tier: 1 },
  { sportmonksId: 384, code: "I1", id: "it-serie-a", countryCode: "IT", name: "Serie A", tier: 1 },
  { sportmonksId: 387, code: "I2", id: "it-serie-b", countryCode: "IT", name: "Serie B", tier: 2 },
  { sportmonksId: 444, code: "NOR1", id: "no-eliteserien", countryCode: "NO", name: "Eliteserien", tier: 1 },
  { sportmonksId: 453, code: "POL1", id: "pl-ekstraklasa", countryCode: "PL", name: "Ekstraklasa", tier: 1 },
  { sportmonksId: 462, code: "PPL", id: "pt-primeira-liga", countryCode: "PT", name: "Liga Portugal", tier: 1 },
  { sportmonksId: 486, code: "RUS1", id: "ru-premier-league", countryCode: "RU", name: "Premier League", tier: 1 },
  { sportmonksId: 501, code: "SCO1", id: "sco-premiership", countryCode: "GB", name: "Premiership", tier: 1 },
  { sportmonksId: 564, code: "SP1", id: "es-la-liga", countryCode: "ES", name: "La Liga", tier: 1 },
  { sportmonksId: 567, code: "SP2", id: "es-la-liga-2", countryCode: "ES", name: "La Liga 2", tier: 2 },
  { sportmonksId: 573, code: "SWE1", id: "se-allsvenskan", countryCode: "SE", name: "Allsvenskan", tier: 1 },
  { sportmonksId: 591, code: "SUI1", id: "ch-super-league", countryCode: "CH", name: "Super League", tier: 1 },
  { sportmonksId: 600, code: "T1", id: "tr-super-lig", countryCode: "TR", name: "Süper Lig", tier: 1 },
  { sportmonksId: 609, code: "UKR1", id: "ua-premier-league", countryCode: "UA", name: "Premier League", tier: 1 },
  { sportmonksId: 636, code: "ARG1", id: "ar-liga-profesional", countryCode: "AR", name: "Liga Profesional", tier: 1 },
  { sportmonksId: 648, code: "BRA1", id: "br-serie-a", countryCode: "BR", name: "Serie A", tier: 1 },
  { sportmonksId: 651, code: "BRA2", id: "br-serie-b", countryCode: "BR", name: "Serie B", tier: 2 },
  { sportmonksId: 743, code: "MEX1", id: "mx-liga-mx", countryCode: "MX", name: "Liga MX", tier: 1 },
  { sportmonksId: 779, code: "MLS", id: "us-major-league-soccer", countryCode: "US", name: "Major League Soccer", tier: 1 },
  { sportmonksId: 944, code: "SA1", id: "sa-pro-league", countryCode: "SA", name: "Saudi Pro League", tier: 1 },
  { sportmonksId: 968, code: "JPN1", id: "jp-j1-league", countryCode: "JP", name: "J1 League", tier: 1 },
] as const satisfies readonly LeagueMeta[];

const LEAGUE_BY_ID = new Map<number, LeagueMeta>(SPORTMONKS_PLAN_LEAGUES.map((league) => [league.sportmonksId, league]));

export type SportMonksFeatureStatus = "available" | "unavailable" | "unknown";

export type SportMonksAccountCoverage = {
  status: "verified" | "partial" | "unavailable";
  expectedLeagueIds: number[];
  licensedLeagueIds: number[];
  missingLeagueIds: number[];
  resourceLabels: string[];
  enrichmentLabels: string[];
  features: Record<"statistics" | "lineups" | "injuries" | "xg" | "odds", SportMonksFeatureStatus>;
  checkedAt: string;
  errors: string[];
};

export type SportMonksRateLimit = {
  limit: number | null;
  remaining: number | null;
  reset: string | null;
  observedResponses: number;
};

export function buildSportMonksAccountUrls() {
  return {
    leagues: `${SPORTMONKS_ACCOUNT_BASE_URL}/leagues`,
    resources: `${SPORTMONKS_ACCOUNT_BASE_URL}/resources`,
    enrichments: `${SPORTMONKS_ACCOUNT_BASE_URL}/enrichments`,
  } as const;
}

export function parseSportMonksAccountCoverage(input: {
  leagues?: unknown;
  resources?: unknown;
  enrichments?: unknown;
  checkedAt: string;
  errors?: string[];
}): SportMonksAccountCoverage {
  const expectedLeagueIds = SPORTMONKS_PLAN_LEAGUES.map((league) => league.sportmonksId);
  const licensedLeagueIds = [...new Set(collectLeagueIds(input.leagues))].sort((a, b) => a - b);
  const resourceLabels = collectLabels(input.resources);
  const enrichmentLabels = collectLabels(input.enrichments);
  const haystack = [...resourceLabels, ...enrichmentLabels].join(" ").toLowerCase();
  const missingLeagueIds = expectedLeagueIds.filter((id) => !licensedLeagueIds.includes(id));
  const errors = input.errors ?? [];
  const status = licensedLeagueIds.length === 0
    ? "unavailable"
    : missingLeagueIds.length === 0 && errors.length === 0 ? "verified" : "partial";
  return {
    status,
    expectedLeagueIds,
    licensedLeagueIds,
    missingLeagueIds,
    resourceLabels,
    enrichmentLabels,
    features: {
      statistics: featureStatus(haystack, ["statistic", "stats"]),
      lineups: featureStatus(haystack, ["lineup"]),
      injuries: featureStatus(haystack, ["injur", "sidelined"]),
      xg: featureStatus(haystack, ["expected goal", " xg", "xg "]),
      odds: featureStatus(haystack, ["odd", "market"]),
    },
    checkedAt: new Date(input.checkedAt).toISOString(),
    errors,
  };
}

export function readSportMonksRateLimit(headers: Headers): SportMonksRateLimit {
  return {
    limit: headerNumber(headers, ["x-ratelimit-limit", "ratelimit-limit"]),
    remaining: headerNumber(headers, ["x-ratelimit-remaining", "ratelimit-remaining"]),
    reset: headerValue(headers, ["x-ratelimit-reset", "ratelimit-reset"]),
    observedResponses: 1,
  };
}

export function mergeSportMonksRateLimits(values: SportMonksRateLimit[]): SportMonksRateLimit {
  const limits = values.flatMap((value) => value.limit === null ? [] : [value.limit]);
  const remaining = values.flatMap((value) => value.remaining === null ? [] : [value.remaining]);
  return {
    limit: limits.length ? Math.max(...limits) : null,
    remaining: remaining.length ? Math.min(...remaining) : null,
    reset: values.findLast((value) => value.reset !== null)?.reset ?? null,
    observedResponses: values.reduce((total, value) => total + value.observedResponses, 0),
  };
}

type SportMonksFixture = {
  id?: unknown;
  league_id?: unknown;
  season_id?: unknown;
  state_id?: unknown;
  starting_at?: unknown;
  state?: { state?: unknown; name?: unknown; short_name?: unknown; developer_name?: unknown };
  participants?: Array<{ id?: unknown; name?: unknown; short_code?: unknown; meta?: { location?: unknown } }>;
  scores?: Array<{ description?: unknown; score?: { goals?: unknown; participant?: unknown } }>;
  statistics?: Array<{
    type_id?: unknown;
    participant_id?: unknown;
    location?: unknown;
    data?: { value?: unknown };
  }>;
};

export function buildSportMonksDateUrls(referenceAt: string) {
  const now = new Date(referenceAt);
  if (Number.isNaN(now.getTime())) throw new Error("A valid SportMonks reference time is required.");
  const istanbul = new Date(now.getTime() + 3 * 60 * 60_000);
  const today = Date.parse(`${istanbul.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const day = 86_400_000;
  return [0, 1, 2, 3].map((offset) => {
    const date = new Date(today + offset * day).toISOString().slice(0, 10);
    const query = new URLSearchParams({
      include: "participants;scores;state",
      filters: `fixtureLeagues:${SPORTMONKS_PLAN_LEAGUES.map((league) => league.sportmonksId).join(",")}`,
      order: "asc",
      per_page: "50",
    });
    return `${SPORTMONKS_BASE_URL}/date/${date}?${query.toString()}`;
  });
}

export function buildSportMonksTeamHistoryUrl(referenceAt: string, teamId: number) {
  const now = new Date(referenceAt);
  if (Number.isNaN(now.getTime())) throw new Error("A valid SportMonks reference time is required.");
  if (!Number.isInteger(teamId) || teamId <= 0) throw new Error("A valid SportMonks team id is required.");
  const istanbul = new Date(now.getTime() + 3 * 60 * 60_000);
  const localToday = Date.parse(`${istanbul.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const day = 86_400_000;
  const startDate = new Date(localToday - SPORTMONKS_TEAM_HISTORY_DAYS * day).toISOString().slice(0, 10);
  const endDate = new Date(localToday - day).toISOString().slice(0, 10);
  const query = new URLSearchParams({
    include: "participants;scores;state;statistics",
    order: "desc",
    per_page: "50",
  });
  return `${SPORTMONKS_BASE_URL}/between/${startDate}/${endDate}/${teamId}?${query.toString()}`;
}

export function sportMonksPlanTeamIds(fixtures: unknown[]) {
  const allowedLeagueIds = new Set(SPORTMONKS_PLAN_LEAGUES.map((league) => league.sportmonksId));
  const teamIds = new Set<number>();
  for (const item of fixtures) {
    const fixture = item as SportMonksFixture;
    const leagueId = integerValue(fixture.league_id);
    if (leagueId === null || !allowedLeagueIds.has(leagueId)) continue;
    for (const participant of fixture.participants ?? []) {
      const teamId = integerValue(participant.id);
      if (teamId !== null && teamId > 0) teamIds.add(teamId);
    }
  }
  return [...teamIds].sort((first, second) => first - second);
}

export function sportMonksAuthorizationHeader(token: string) {
  const value = token.trim();
  if (!value) throw new Error("SportMonks API token is required.");
  return value;
}

export function sportMonksPageUrl(baseUrl: string, page: number) {
  const url = new URL(baseUrl);
  url.searchParams.set("page", String(page));
  return url.toString();
}

export function parseSportMonksFixtures(input: { json: string; capturedAt: string; upstreamUrl: string }) {
  const capturedAt = new Date(input.capturedAt).toISOString();
  const parsed = JSON.parse(input.json) as { data?: unknown };
  if (!Array.isArray(parsed.data)) throw new Error("SportMonks response does not contain a data array.");
  if (parsed.data.length > 10_000) throw new Error("SportMonks response exceeds the 10,000-fixture safety limit.");
  const grouped = new Map<string, {
    league: LeagueMeta;
    season: string;
    teams: Map<string, NormalizedFootballPayload["teams"][number]>;
    fixtures: NormalizedFootballPayload["fixtures"];
    stats: NormalizedFootballPayload["stats"];
  }>();
  let ignoredCount = 0;
  for (const raw of parsed.data as SportMonksFixture[]) {
    const leagueId = integerValue(raw.league_id);
    const league = leagueId === null ? undefined : LEAGUE_BY_ID.get(leagueId);
    const home = raw.participants?.find((participant) => textValue(participant.meta?.location)?.toLowerCase() === "home");
    const away = raw.participants?.find((participant) => textValue(participant.meta?.location)?.toLowerCase() === "away");
    const homeName = textValue(home?.name);
    const awayName = textValue(away?.name);
    const kickoffAt = normalizeKickoff(textValue(raw.starting_at));
    if (!league || !homeName || !awayName || !kickoffAt) {
      ignoredCount += 1;
      continue;
    }
    const season = String(integerValue(raw.season_id) ?? new Date(kickoffAt).getUTCFullYear());
    const bucketKey = `${league.code}:${season}`;
    let bucket = grouped.get(bucketKey);
    if (!bucket) {
      bucket = { league, season, teams: new Map(), fixtures: [], stats: [] };
      grouped.set(bucketKey, bucket);
    }
    const homeTeamId = footballDataTeamId(league.code, homeName);
    const awayTeamId = footballDataTeamId(league.code, awayName);
    bucket.teams.set(homeTeamId, { id: homeTeamId, name: homeName, shortName: textValue(home?.short_code), countryCode: league.countryCode });
    bucket.teams.set(awayTeamId, { id: awayTeamId, name: awayName, shortName: textValue(away?.short_code), countryCode: league.countryCode });
    const status = mapStatus(raw.state_id, raw.state);
    const homeScore = currentScore(raw.scores, "home");
    const awayScore = currentScore(raw.scores, "away");
    const externalId = textValue(raw.id) ?? `${kickoffAt}|${homeName}|${awayName}`;
    const fixtureId = footballDataFixtureId(league.code, season, externalId, homeName, awayName);
    bucket.fixtures.push({
      id: fixtureId,
      kickoffAt,
      homeTeamId,
      awayTeamId,
      status,
      homeScore: status === "finished" ? homeScore : null,
      awayScore: status === "finished" ? awayScore : null,
    });
    if (status === "finished") {
      const homeStats = normalizedStatistics(raw.statistics, integerValue(home?.id));
      const awayStats = normalizedStatistics(raw.statistics, integerValue(away?.id));
      if (hasAnyStatistic(homeStats)) bucket.stats.push({ fixtureId, teamId: homeTeamId, ...homeStats });
      if (hasAnyStatistic(awayStats)) bucket.stats.push({ fixtureId, teamId: awayTeamId, ...awayStats });
    }
  }
  const qualityIssues: DataQualityIssue[] = [
    issue("SOURCE_COMMERCIAL_RIGHTS_REVIEW", "SportMonks planı ve yayın hakları onaylanana kadar veri research-only kalır.", "source"),
    issue("ODDS_NOT_IMPORTED", "Fikstür turu oran include'unu kullanmaz; değer önerisi üretilemez.", "odds"),
    issue("ADVANCED_FIELDS_PARTIAL", "SportMonks temel maç istatistikleri alınır; kadro, sakatlık ve xG kapsamı ayrıca doğrulanana kadar gelişmiş veri kısmi kabul edilir.", "dataset"),
  ];
  const envelopes: AdminImportEnvelope[] = [...grouped.values()].map((bucket) => ({
    source: { name: "SportMonks Football API v3", baseUrl: input.upstreamUrl, acquisitionMethod: "licensed_feed", legalStatus: "review" },
    capturedAt,
    payload: {
      league: { id: bucket.league.id, countryCode: bucket.league.countryCode, name: bucket.league.name, tier: bucket.league.tier, coverageLevel: bucket.stats.length ? "advanced" : "basic" },
      season: bucket.season,
      teams: [...bucket.teams.values()],
      fixtures: bucket.fixtures,
      stats: bucket.stats, odds: [], lineups: [],
    },
  }));
  return {
    envelopes,
    qualityIssues,
    sourceRowCount: parsed.data.length,
    pilotRowCount: envelopes.reduce((total, envelope) => total + envelope.payload.fixtures.length, 0),
    oddsSnapshotCount: 0,
    ignoredCount,
  };
}

function normalizedStatistics(statistics: SportMonksFixture["statistics"], participantId: number | null) {
  const values = new Map<number, number>();
  for (const statistic of statistics ?? []) {
    if (participantId !== null && integerValue(statistic.participant_id) !== participantId) continue;
    const typeId = integerValue(statistic.type_id);
    const value = numericValue(statistic.data?.value);
    if (typeId !== null && value !== null) values.set(typeId, value);
  }
  return {
    possession: values.get(45) ?? null,
    shots: values.get(42) ?? null,
    shotsOnTarget: values.get(86) ?? null,
    expectedGoals: null,
    dangerousAttacks: values.get(44) ?? null,
    penaltyAreaEntries: null,
    ppda: null,
    bigChancesAllowed: null,
  };
}

function hasAnyStatistic(value: ReturnType<typeof normalizedStatistics>) {
  return Object.values(value).some((item) => item !== null);
}

function currentScore(scores: SportMonksFixture["scores"], participant: "home" | "away") {
  const current = scores?.find((item) => textValue(item.description)?.toUpperCase() === "CURRENT"
    && textValue(item.score?.participant)?.toLowerCase() === participant);
  return integerValue(current?.score?.goals);
}

function mapStatus(stateId: unknown, state: SportMonksFixture["state"]): NormalizedFootballPayload["fixtures"][number]["status"] {
  const id = integerValue(stateId);
  const label = [state?.developer_name, state?.short_name, state?.state, state?.name]
    .map(textValue).filter(Boolean).join(" ").toUpperCase();
  if (id === 5 || /\b(FT|AET|PEN|FINISHED|FULL TIME)\b/.test(label)) return "finished";
  if (/\b(LIVE|INPLAY|IN PLAY|1ST HALF|2ND HALF|HT|ET|BREAK)\b/.test(label)) return "live";
  if (/\b(POSTPONED|SUSPENDED|ABANDONED)\b/.test(label)) return "postponed";
  if (/\b(CANCELLED|CANCELED)\b/.test(label)) return "cancelled";
  return "scheduled";
}

function normalizeKickoff(value: string | null) {
  if (!value) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(" ", "T")}Z` : value;
  return Number.isFinite(Date.parse(normalized)) ? new Date(normalized).toISOString() : null;
}

function textValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function integerValue(value: unknown) {
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function numericValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function collectLeagueIds(value: unknown): number[] {
  const root = unwrapData(value);
  if (!Array.isArray(root)) return [];
  return root.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const id = integerValue(row.id) ?? integerValue(row.league_id);
    return id === null ? [] : [id];
  });
}

function collectLabels(value: unknown) {
  const labels = new Set<string>();
  const visit = (item: unknown, depth = 0) => {
    if (depth > 5 || item === null || item === undefined) return;
    if (typeof item === "string" && item.trim()) {
      labels.add(item.trim());
      return;
    }
    if (Array.isArray(item)) {
      for (const child of item) visit(child, depth + 1);
      return;
    }
    if (typeof item !== "object") return;
    for (const [key, child] of Object.entries(item as Record<string, unknown>)) {
      if (["name", "code", "key", "resource", "endpoint", "type"].includes(key) && typeof child === "string") {
        labels.add(child.trim());
      } else if (["data", "resources", "enrichments", "includes", "items"].includes(key)) {
        visit(child, depth + 1);
      }
    }
  };
  visit(value);
  return [...labels].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

function unwrapData(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value) && "data" in value) {
    return (value as { data?: unknown }).data;
  }
  return value;
}

function featureStatus(haystack: string, needles: string[]): SportMonksFeatureStatus {
  if (!haystack) return "unknown";
  return needles.some((needle) => haystack.includes(needle)) ? "available" : "unavailable";
}

function headerNumber(headers: Headers, names: string[]) {
  const raw = headerValue(headers, names);
  if (raw === null || !Number.isFinite(Number(raw))) return null;
  return Number(raw);
}

function headerValue(headers: Headers, names: string[]) {
  for (const name of names) {
    const value = headers.get(name)?.trim();
    if (value) return value;
  }
  return null;
}

function issue(code: string, message: string, entityType: DataQualityIssue["entityType"]): DataQualityIssue {
  return { severity: "warning", code, message, entityType };
}
