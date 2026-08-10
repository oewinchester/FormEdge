import type { DataQualityIssue } from "./data-quality.ts";
import type { AdminImportEnvelope, NormalizedFootballPayload } from "./import-contract.ts";
import { footballDataFixtureId, footballDataTeamId } from "./football-data-source.ts";

export const API_FOOTBALL_ADAPTER_VERSION = "api-football-v3-fixtures-v1" as const;
export const API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io/fixtures" as const;
export const API_FOOTBALL_MAX_BYTES = 8_000_000;

const KNOWN_LEAGUES = new Map<number, LeagueMeta>([
  [1, { code: "WC", id: "fifa-world-cup", countryCode: "WW", name: "FIFA World Cup", tier: 1 }],
  [2, { code: "UCL", id: "uefa-champions-league", countryCode: "EU", name: "UEFA Champions League", tier: 1 }],
  [4, { code: "EC", id: "uefa-european-championship", countryCode: "EU", name: "European Championship", tier: 1 }],
  [39, { code: "E0", id: "eng-premier-league", countryCode: "GB", name: "Premier League", tier: 1 }],
  [40, { code: "ELC", id: "eng-championship", countryCode: "GB", name: "Championship", tier: 2 }],
  [61, { code: "FL1", id: "fr-ligue-1", countryCode: "FR", name: "Ligue 1", tier: 1 }],
  [71, { code: "BSA", id: "br-serie-a", countryCode: "BR", name: "Campeonato Brasileiro Serie A", tier: 1 }],
  [78, { code: "D1", id: "de-bundesliga", countryCode: "DE", name: "Bundesliga", tier: 1 }],
  [88, { code: "DED", id: "nl-eredivisie", countryCode: "NL", name: "Eredivisie", tier: 1 }],
  [94, { code: "PPL", id: "pt-primeira-liga", countryCode: "PT", name: "Primeira Liga", tier: 1 }],
  [135, { code: "I1", id: "it-serie-a", countryCode: "IT", name: "Serie A", tier: 1 }],
  [140, { code: "SP1", id: "es-la-liga", countryCode: "ES", name: "La Liga", tier: 1 }],
  [203, { code: "T1", id: "tr-super-lig", countryCode: "TR", name: "Süper Lig", tier: 1 }],
]);

type LeagueMeta = { code: string; id: string; countryCode: string; name: string; tier: number };
type ApiFixture = {
  fixture?: { id?: unknown; date?: unknown; status?: { short?: unknown } };
  league?: { id?: unknown; name?: unknown; country?: unknown; season?: unknown };
  teams?: { home?: { name?: unknown }; away?: { name?: unknown } };
  goals?: { home?: unknown; away?: unknown };
};

export function buildApiFootballWindowUrls(referenceAt: string) {
  const now = new Date(referenceAt);
  if (Number.isNaN(now.getTime())) throw new Error("A valid API-Football reference time is required.");
  const local = new Date(now.getTime() + 3 * 60 * 60_000);
  const today = Date.parse(`${local.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const day = 86_400_000;
  return [
    [today - 40 * day, today - day],
    [today, today + 3 * day],
  ].map(([from, to]) => `${API_FOOTBALL_BASE_URL}?${new URLSearchParams({
    from: new Date(from).toISOString().slice(0, 10),
    to: new Date(to).toISOString().slice(0, 10),
    timezone: "UTC",
  }).toString()}`);
}

export function parseApiFootballFixtures(input: { json: string; capturedAt: string; upstreamUrl: string }) {
  const capturedAt = new Date(input.capturedAt).toISOString();
  const parsed = JSON.parse(input.json) as { response?: unknown; errors?: unknown };
  if (hasProviderErrors(parsed.errors)) throw new Error("API-Football response contains provider errors.");
  if (!Array.isArray(parsed.response)) throw new Error("API-Football response does not contain a response array.");
  if (parsed.response.length > 5_000) throw new Error("API-Football response exceeds the 5,000-fixture safety limit.");
  const grouped = new Map<string, {
    league: LeagueMeta;
    season: string;
    teams: Map<string, NormalizedFootballPayload["teams"][number]>;
    fixtures: NormalizedFootballPayload["fixtures"];
  }>();
  let ignoredCount = 0;
  for (const raw of parsed.response as ApiFixture[]) {
    const leagueId = integerValue(raw.league?.id);
    const leagueName = textValue(raw.league?.name);
    const country = textValue(raw.league?.country);
    const homeName = textValue(raw.teams?.home?.name);
    const awayName = textValue(raw.teams?.away?.name);
    const kickoffAt = textValue(raw.fixture?.date);
    if (leagueId === null || !leagueName || !homeName || !awayName || !kickoffAt || !Number.isFinite(Date.parse(kickoffAt))) {
      ignoredCount += 1;
      continue;
    }
    const league = KNOWN_LEAGUES.get(leagueId) ?? {
      code: `AF${leagueId}`,
      id: `api-football-league-${leagueId}`,
      countryCode: countryCode(country),
      name: leagueName,
      tier: 1,
    };
    const season = String(integerValue(raw.league?.season) ?? new Date(kickoffAt).getUTCFullYear());
    const bucketKey = `${league.code}:${season}`;
    let bucket = grouped.get(bucketKey);
    if (!bucket) {
      bucket = { league, season, teams: new Map(), fixtures: [] };
      grouped.set(bucketKey, bucket);
    }
    const homeTeamId = footballDataTeamId(league.code, homeName);
    const awayTeamId = footballDataTeamId(league.code, awayName);
    bucket.teams.set(homeTeamId, { id: homeTeamId, name: homeName, shortName: null, countryCode: league.countryCode });
    bucket.teams.set(awayTeamId, { id: awayTeamId, name: awayName, shortName: null, countryCode: league.countryCode });
    const status = mapStatus(textValue(raw.fixture?.status?.short));
    const homeScore = integerValue(raw.goals?.home);
    const awayScore = integerValue(raw.goals?.away);
    const externalId = textValue(raw.fixture?.id) ?? `${kickoffAt}|${homeName}|${awayName}`;
    bucket.fixtures.push({
      id: footballDataFixtureId(league.code, season, externalId, homeName, awayName),
      kickoffAt: new Date(kickoffAt).toISOString(),
      homeTeamId,
      awayTeamId,
      status,
      homeScore: status === "finished" ? homeScore : null,
      awayScore: status === "finished" ? awayScore : null,
    });
  }
  const qualityIssues: DataQualityIssue[] = [
    issue("SOURCE_COMMERCIAL_RIGHTS_REVIEW", "API-Football kullanım planı ve yayın hakları onaylanana kadar veri research-only kalır.", "source"),
    issue("ODDS_NOT_IMPORTED", "Fikstür turu oran endpoint'ini kullanmaz; değer önerisi üretilemez.", "odds"),
    issue("ADVANCED_FIELDS_SEPARATE", "Kadrolar, sakatlıklar ve maç istatistikleri ayrı endpointlerden doğrulanmadan gelişmiş veri kabul edilmez.", "dataset"),
  ];
  const envelopes: AdminImportEnvelope[] = [...grouped.values()].map((bucket) => ({
    source: { name: "API-Football v3", baseUrl: input.upstreamUrl, acquisitionMethod: "licensed_feed", legalStatus: "review" },
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
    sourceRowCount: parsed.response.length,
    pilotRowCount: envelopes.reduce((total, envelope) => total + envelope.payload.fixtures.length, 0),
    oddsSnapshotCount: 0,
    ignoredCount,
  };
}

export function apiFootballProviderError(errors: unknown) {
  if (!hasProviderErrors(errors)) return null;
  return "API-Football isteği plan, parametre veya kimlik doğrulama hatası döndürdü.";
}

function hasProviderErrors(value: unknown) {
  return Array.isArray(value) ? value.length > 0 : Boolean(value && typeof value === "object" && Object.keys(value).length);
}

function mapStatus(value: string | null): NormalizedFootballPayload["fixtures"][number]["status"] {
  if (["FT", "AET", "PEN"].includes(value ?? "")) return "finished";
  if (["1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT"].includes(value ?? "")) return "live";
  if (["PST", "SUSP", "ABD"].includes(value ?? "")) return "postponed";
  if (value === "CANC") return "cancelled";
  return "scheduled";
}

function countryCode(value: string | null) {
  const known: Record<string, string> = { England: "GB", Germany: "DE", Spain: "ES", Italy: "IT", France: "FR", Turkey: "TR", Türkiye: "TR", Portugal: "PT", Netherlands: "NL", Brazil: "BR", World: "WW" };
  return known[value ?? ""] ?? "WW";
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
