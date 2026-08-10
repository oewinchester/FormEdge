import type { DataQualityIssue } from "./data-quality.ts";
import type { AdminImportEnvelope, NormalizedFootballPayload } from "./import-contract.ts";
import {
  FOOTBALL_DATA_PILOT_LEAGUES,
  footballDataFixtureId,
  footballDataTeamId,
} from "./football-data-source.ts";

export const FOOTBALL_DATA_ORG_ADAPTER_VERSION = "football-data-org-v4-matches-v1" as const;
export const FOOTBALL_DATA_ORG_BASE_URL = "https://api.football-data.org/v4/matches" as const;
export const FOOTBALL_DATA_ORG_MAX_BYTES = 5_000_000;

const API_TO_PILOT = new Map([
  ["PL", "E0"],
  ["BL1", "D1"],
  ["PD", "SP1"],
  ["SA", "I1"],
] as const);

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
  const query = new URLSearchParams({ competitions: "PL,BL1,PD,SA", dateFrom, dateTo });
  return `${FOOTBALL_DATA_ORG_BASE_URL}?${query.toString()}`;
}

export function parseFootballDataOrgMatches(input: {
  json: string;
  capturedAt: string;
  upstreamUrl: string;
}) {
  const capturedAt = new Date(input.capturedAt).toISOString();
  const parsed = JSON.parse(input.json) as { matches?: unknown };
  if (!Array.isArray(parsed.matches)) throw new Error("football-data.org response does not contain a matches array.");
  if (parsed.matches.length > 500) throw new Error("football-data.org response exceeds the 500-match safety limit.");
  const leagueByCode = new Map(FOOTBALL_DATA_PILOT_LEAGUES.map((league) => [league.code, league]));
  const grouped = new Map<string, {
    league: typeof FOOTBALL_DATA_PILOT_LEAGUES[number];
    season: string;
    teams: Map<string, NormalizedFootballPayload["teams"][number]>;
    fixtures: NormalizedFootballPayload["fixtures"];
  }>();
  let ignoredCount = 0;
  for (const raw of parsed.matches as ApiMatch[]) {
    const apiCode = textValue(raw.competition?.code);
    const pilotCode = apiCode ? API_TO_PILOT.get(apiCode as never) : undefined;
    const league = pilotCode ? leagueByCode.get(pilotCode) : undefined;
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
