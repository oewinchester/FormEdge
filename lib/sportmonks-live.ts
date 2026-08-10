import type { DataQualityIssue } from "./data-quality.ts";
import type { AdminImportEnvelope, NormalizedFootballPayload } from "./import-contract.ts";
import { footballDataFixtureId, footballDataTeamId } from "./football-data-source.ts";

export const SPORTMONKS_ADAPTER_VERSION = "sportmonks-v3-fixtures-v3" as const;
export const SPORTMONKS_BASE_URL = "https://api.sportmonks.com/v3/football/fixtures" as const;
export const SPORTMONKS_MAX_BYTES = 8_000_000;
export const SPORTMONKS_MAX_PAGES_PER_CYCLE = 3;

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

type SportMonksFixture = {
  id?: unknown;
  league_id?: unknown;
  season_id?: unknown;
  state_id?: unknown;
  starting_at?: unknown;
  state?: { state?: unknown; name?: unknown; short_name?: unknown; developer_name?: unknown };
  participants?: Array<{ id?: unknown; name?: unknown; short_code?: unknown; meta?: { location?: unknown } }>;
  scores?: Array<{ description?: unknown; score?: { goals?: unknown; participant?: unknown } }>;
};

export function buildSportMonksWindowUrl(referenceAt: string) {
  const now = new Date(referenceAt);
  if (Number.isNaN(now.getTime())) throw new Error("A valid SportMonks reference time is required.");
  const istanbul = new Date(now.getTime() + 3 * 60 * 60_000);
  const today = Date.parse(`${istanbul.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const day = 86_400_000;
  const start = new Date(today - day).toISOString().slice(0, 10);
  const end = new Date(today + 3 * day).toISOString().slice(0, 10);
  const query = new URLSearchParams({
    include: "participants;scores;state",
    order: "asc",
    per_page: "50",
  });
  return `${SPORTMONKS_BASE_URL}/between/${start}/${end}?${query.toString()}`;
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
  if (parsed.data.length > 5_000) throw new Error("SportMonks response exceeds the 5,000-fixture safety limit.");
  const grouped = new Map<string, {
    league: LeagueMeta;
    season: string;
    teams: Map<string, NormalizedFootballPayload["teams"][number]>;
    fixtures: NormalizedFootballPayload["fixtures"];
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
      bucket = { league, season, teams: new Map(), fixtures: [] };
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
    bucket.fixtures.push({
      id: footballDataFixtureId(league.code, season, externalId, homeName, awayName),
      kickoffAt,
      homeTeamId,
      awayTeamId,
      status,
      homeScore: status === "finished" ? homeScore : null,
      awayScore: status === "finished" ? awayScore : null,
    });
  }
  const qualityIssues: DataQualityIssue[] = [
    issue("SOURCE_COMMERCIAL_RIGHTS_REVIEW", "SportMonks planı ve yayın hakları onaylanana kadar veri research-only kalır.", "source"),
    issue("ODDS_NOT_IMPORTED", "Fikstür turu oran include'unu kullanmaz; değer önerisi üretilemez.", "odds"),
    issue("ADVANCED_FIELDS_SEPARATE", "Kadrolar, sakatlıklar ve ayrıntılı istatistikler doğrulanmadan gelişmiş veri kabul edilmez.", "dataset"),
  ];
  const envelopes: AdminImportEnvelope[] = [...grouped.values()].map((bucket) => ({
    source: { name: "SportMonks Football API v3", baseUrl: input.upstreamUrl, acquisitionMethod: "licensed_feed", legalStatus: "review" },
    capturedAt,
    payload: {
      league: { id: bucket.league.id, countryCode: bucket.league.countryCode, name: bucket.league.name, tier: bucket.league.tier, coverageLevel: "basic" },
      season: bucket.season,
      teams: [...bucket.teams.values()],
      fixtures: bucket.fixtures,
      stats: [], odds: [], lineups: [],
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

function issue(code: string, message: string, entityType: DataQualityIssue["entityType"]): DataQualityIssue {
  return { severity: "warning", code, message, entityType };
}
