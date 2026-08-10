import type { DataQualityIssue } from "./data-quality.ts";
import type { AdminImportEnvelope, NormalizedFootballPayload } from "./import-contract.ts";
import {
  footballDataFixtureId,
  footballDataTeamId,
} from "./football-data-source.ts";

export const FOOTBALL_DATA_ORG_ADAPTER_VERSION = "football-data-org-v4-matches-v2" as const;
export const FOOTBALL_DATA_ORG_BASE_URL = "https://api.football-data.org/v4/matches" as const;
export const FOOTBALL_DATA_ORG_MAX_BYTES = 5_000_000;

export const FOOTBALL_DATA_ORG_FREE_COMPETITIONS = [
  { apiCode: "CL", code: "UCL", id: "uefa-champions-league", countryCode: "EU", name: "UEFA Champions League", tier: 1 },
  { apiCode: "PPL", code: "PPL", id: "pt-primeira-liga", countryCode: "PT", name: "Primeira Liga", tier: 1 },
  { apiCode: "PL", code: "E0", id: "eng-premier-league", countryCode: "GB", name: "Premier League", tier: 1 },
  { apiCode: "DED", code: "DED", id: "nl-eredivisie", countryCode: "NL", name: "Eredivisie", tier: 1 },
  { apiCode: "BL1", code: "D1", id: "de-bundesliga", countryCode: "DE", name: "Bundesliga", tier: 1 },
  { apiCode: "FL1", code: "FL1", id: "fr-ligue-1", countryCode: "FR", name: "Ligue 1", tier: 1 },
  { apiCode: "SA", code: "I1", id: "it-serie-a", countryCode: "IT", name: "Serie A", tier: 1 },
  { apiCode: "PD", code: "SP1", id: "es-la-liga", countryCode: "ES", name: "La Liga", tier: 1 },
  { apiCode: "ELC", code: "ELC", id: "eng-championship", countryCode: "GB", name: "Championship", tier: 2 },
  { apiCode: "BSA", code: "BSA", id: "br-serie-a", countryCode: "BR", name: "Campeonato Brasileiro Serie A", tier: 1 },
  { apiCode: "WC", code: "WC", id: "fifa-world-cup", countryCode: "WW", name: "FIFA World Cup", tier: 1 },
  { apiCode: "EC", code: "EC", id: "uefa-european-championship", countryCode: "EU", name: "European Championship", tier: 1 },
] as const;

const API_TO_LEAGUE = new Map(FOOTBALL_DATA_ORG_FREE_COMPETITIONS.map((league) => [league.apiCode, league]));

type ApiMatch = {
  id?: unknown;
  utcDate?: unknown;
  status?: unknown;
  competition?: { code?: unknown };
  season?: { startDate?: unknown };
  homeTeam?: { name?: unknown; shortName?: unknown };
  awayTeam?: { name?: unknown; shortName?: unknown };
  score?: { fullTime?: { home?: unknown; away?: unknown } };
};

export function buildFootballDataOrgMatchesUrl(referenceAt: string) {
  const now = new Date(referenceAt);
  if (Number.isNaN(now.getTime())) throw new Error("A valid live feed reference time is required.");
  const local = new Date(now.getTime() + 3 * 60 * 60_000);
  const dateFrom = local.toISOString().slice(0, 10);
  const dateTo = new Date(Date.parse(`${dateFrom}T00:00:00.000Z`) + 3 * 86_400_000).toISOString().slice(0, 10);
  const query = new URLSearchParams({ competitions: FOOTBALL_DATA_ORG_FREE_COMPETITIONS.map((item) => item.apiCode).join(","), dateFrom, dateTo });
  return `${FOOTBALL_DATA_ORG_BASE_URL}?${query.toString()}`;
}

export function buildFootballDataOrgWindowUrls(referenceAt: string) {
  const now = new Date(referenceAt);
  if (Number.isNaN(now.getTime())) throw new Error("A valid live feed reference time is required.");
  const local = new Date(now.getTime() + 3 * 60 * 60_000);
  const today = Date.parse(`${local.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const day = 86_400_000;
  const competitions = FOOTBALL_DATA_ORG_FREE_COMPETITIONS.map((item) => item.apiCode).join(",");
  const windows = [
    [today - 40 * day, today - 30 * day],
    [today - 30 * day, today - 20 * day],
    [today - 20 * day, today - 10 * day],
    [today - 10 * day, today],
    [today, today + 3 * day],
  ];
  return windows.map(([from, to]) => {
    const dateFrom = new Date(from).toISOString().slice(0, 10);
    const dateTo = new Date(to).toISOString().slice(0, 10);
    return `${FOOTBALL_DATA_ORG_BASE_URL}?${new URLSearchParams({ competitions, dateFrom, dateTo }).toString()}`;
  });
}

export function parseFootballDataOrgMatches(input: {
  json: string;
  capturedAt: string;
  upstreamUrl: string;
}) {
  const capturedAt = new Date(input.capturedAt).toISOString();
  const parsed = JSON.parse(input.json) as { matches?: unknown };
  if (!Array.isArray(parsed.matches)) throw new Error("football-data.org response does not contain a matches array.");
  if (parsed.matches.length > 3_000) throw new Error("football-data.org response exceeds the 3,000-match safety limit.");
  const grouped = new Map<string, {
    league: typeof FOOTBALL_DATA_ORG_FREE_COMPETITIONS[number];
    season: string;
    teams: Map<string, NormalizedFootballPayload["teams"][number]>;
    fixtures: NormalizedFootballPayload["fixtures"];
  }>();
  let ignoredCount = 0;
  for (const raw of parsed.matches as ApiMatch[]) {
    const apiCode = textValue(raw.competition?.code);
    const league = apiCode ? API_TO_LEAGUE.get(apiCode as typeof FOOTBALL_DATA_ORG_FREE_COMPETITIONS[number]["apiCode"]) : undefined;
    const homeName = textValue(raw.homeTeam?.name);
    const awayName = textValue(raw.awayTeam?.name);
    const kickoffAt = textValue(raw.utcDate);
    if (!league || !homeName || !awayName || !kickoffAt || !Number.isFinite(Date.parse(kickoffAt))) {
      ignoredCount += 1;
      continue;
    }
    const seasonStart = textValue(raw.season?.startDate)?.slice(0, 4) ?? String(new Date(kickoffAt).getUTCFullYear());
    const season = `${seasonStart}-${String(Number(seasonStart) + 1).slice(-2)}`;
    let bucket = grouped.get(league.code);
    if (!bucket) {
      bucket = { league, season, teams: new Map(), fixtures: [] };
      grouped.set(league.code, bucket);
    }
    const homeTeamId = footballDataTeamId(league.code, homeName);
    const awayTeamId = footballDataTeamId(league.code, awayName);
    bucket.teams.set(homeTeamId, { id: homeTeamId, name: homeName, shortName: textValue(raw.homeTeam?.shortName), countryCode: league.countryCode });
    bucket.teams.set(awayTeamId, { id: awayTeamId, name: awayName, shortName: textValue(raw.awayTeam?.shortName), countryCode: league.countryCode });
    const externalId = textValue(raw.id) ?? `${kickoffAt}|${homeName}|${awayName}`;
    const status = mapStatus(textValue(raw.status));
    const homeScore = numberValue(raw.score?.fullTime?.home);
    const awayScore = numberValue(raw.score?.fullTime?.away);
    bucket.fixtures.push({
      id: footballDataFixtureId(league.code, seasonStart, externalId, homeName, awayName),
      kickoffAt: new Date(kickoffAt).toISOString(),
      homeTeamId,
      awayTeamId,
      status,
      homeScore: status === "finished" ? homeScore : null,
      awayScore: status === "finished" ? awayScore : null,
    });
  }
  const qualityIssues: DataQualityIssue[] = [
    issue("SOURCE_COMMERCIAL_RIGHTS_REVIEW", "football-data.org yeniden kullanım koşulları onaylanana kadar veri research-only kalır.", "source"),
    issue("ODDS_UNAVAILABLE", "Bu fikstür isteği piyasa oranı sağlamaz; değer önerisi üretilemez.", "odds"),
    issue("ADVANCED_FIELDS_UNAVAILABLE", "Ücretsiz fikstür isteği kadro, xG ve gelişmiş maç bağlamı sağlamaz.", "dataset"),
  ];
  const envelopes: AdminImportEnvelope[] = [...grouped.values()].map((bucket) => ({
    source: {
      name: "football-data.org v4",
      baseUrl: input.upstreamUrl,
      acquisitionMethod: "public_dataset",
      legalStatus: "review",
    },
    capturedAt,
    payload: {
      league: {
        id: bucket.league.id,
        countryCode: bucket.league.countryCode,
        name: bucket.league.name,
        tier: bucket.league.tier,
        coverageLevel: "basic",
      },
      season: bucket.season,
      teams: [...bucket.teams.values()],
      fixtures: bucket.fixtures,
      stats: [],
      odds: [],
      lineups: [],
    },
  }));
  return {
    envelopes,
    qualityIssues,
    sourceRowCount: parsed.matches.length,
    pilotRowCount: envelopes.reduce((total, envelope) => total + envelope.payload.fixtures.length, 0),
    oddsSnapshotCount: 0,
    ignoredCount,
  };
}

function mapStatus(value: string | null): NormalizedFootballPayload["fixtures"][number]["status"] {
  if (value === "FINISHED") return "finished";
  if (["IN_PLAY", "PAUSED", "LIVE"].includes(value ?? "")) return "live";
  if (["POSTPONED", "SUSPENDED"].includes(value ?? "")) return "postponed";
  if (value === "CANCELLED") return "cancelled";
  return "scheduled";
}

function textValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function issue(code: string, message: string, entityType: DataQualityIssue["entityType"]): DataQualityIssue {
  return { severity: "warning", code, message, entityType };
}
