import type { DataQualityIssue } from "./data-quality.ts";
import type { AdminImportEnvelope, NormalizedFootballPayload } from "./import-contract.ts";
import {
  FOOTBALL_DATA_LIVE_SEASON,
  FOOTBALL_DATA_PILOT_LEAGUES,
  FOOTBALL_DATA_SOURCE_NAME,
  FootballDataSourceError,
  footballDataFixtureId,
  footballDataStableHash,
  footballDataTeamId,
  normalizeFootballDataTeamName,
  parseFootballDataCsvMatrix,
  parseFootballDataKickoff,
  type FootballDataSourceIssue,
} from "./football-data-source.ts";

export const FOOTBALL_DATA_FIXTURE_FEED_ADAPTER_VERSION = "football-data-fixtures-v1" as const;
export const FOOTBALL_DATA_FIXTURE_FEED_URL = "https://www.football-data.co.uk/fixtures.csv" as const;
export const FOOTBALL_DATA_FIXTURE_FEED_MAX_BYTES = 5_000_000;

const BOOKMAKER_COLUMNS = [
  { code: "B365", label: "Bet365" },
  { code: "BFD", label: "Betfred" },
  { code: "BMGM", label: "BetMGM" },
  { code: "BV", label: "BetVictor" },
  { code: "BW", label: "Bet&Win" },
  { code: "PP", label: "Paddy Power" },
  { code: "BFE", label: "Betfair Exchange" },
] as const;

export type ParsedFootballDataFixtureFeed = {
  envelopes: AdminImportEnvelope[];
  qualityIssues: DataQualityIssue[];
  sourceRowCount: number;
  pilotRowCount: number;
  oddsSnapshotCount: number;
  ignoredIncompleteOddsTriples: number;
};

export function parseFootballDataFixtureFeed(input: {
  csv: string;
  capturedAt: string;
}): ParsedFootballDataFixtureFeed {
  const capturedAt = validIso(input.capturedAt);
  if (!input.csv.trim()) throw sourceError("EMPTY_FILE", "Fikstür CSV içeriği boş.");
  if (new TextEncoder().encode(input.csv).byteLength > FOOTBALL_DATA_FIXTURE_FEED_MAX_BYTES) {
    throw sourceError("FILE_TOO_LARGE", "Fikstür CSV 5 MB güvenlik sınırını aşıyor.");
  }

  const matrix = parseFootballDataCsvMatrix(input.csv);
  if (!matrix.length) throw sourceError("EMPTY_FILE", "Fikstür CSV içeriği boş.");
  const headers = matrix[0].map((value) => value.replace(/^\uFEFF/, "").trim());
  const missing = ["Div", "Date", "Time", "HomeTeam", "AwayTeam"].filter((header) => !headers.includes(header));
  if (missing.length) {
    throw new FootballDataSourceError(missing.map((field) => ({
      row: 1,
      field,
      code: "MISSING_COLUMN",
      message: `Fikstür CSV zorunlu “${field}” kolonunu içermiyor.`,
    })));
  }

  const leagueByCode = new Map(FOOTBALL_DATA_PILOT_LEAGUES.map((league) => [league.code, league]));
  const payloadByLeague = new Map<string, {
    league: typeof FOOTBALL_DATA_PILOT_LEAGUES[number];
    teams: Map<string, NormalizedFootballPayload["teams"][number]>;
    fixtures: NormalizedFootballPayload["fixtures"];
    odds: NormalizedFootballPayload["odds"];
    fixtureIds: Set<string>;
  }>();
  const issues: FootballDataSourceIssue[] = [];
  let sourceRowCount = 0;
  let pilotRowCount = 0;
  let ignoredIncompleteOddsTriples = 0;

  for (let index = 1; index < matrix.length; index += 1) {
    const cells = matrix[index];
    if (cells.every((cell) => !cell.trim())) continue;
    sourceRowCount += 1;
    const rowNumber = index + 1;
    const row = Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex]?.trim() ?? ""]));
    const league = leagueByCode.get(row.Div as typeof FOOTBALL_DATA_PILOT_LEAGUES[number]["code"]);
    if (!league) continue;
    pilotRowCount += 1;

    const homeName = row.HomeTeam?.trim();
    const awayName = row.AwayTeam?.trim();
    if (!homeName) issues.push(fieldIssue(rowNumber, "HomeTeam", "REQUIRED_VALUE", "HomeTeam boş olamaz."));
    if (!awayName) issues.push(fieldIssue(rowNumber, "AwayTeam", "REQUIRED_VALUE", "AwayTeam boş olamaz."));
    if (homeName && awayName && normalizeFootballDataTeamName(homeName) === normalizeFootballDataTeamName(awayName)) {
      issues.push(fieldIssue(rowNumber, "AwayTeam", "SAME_TEAM", "Ev ve deplasman takımı aynı olamaz."));
    }
    const kickoffAt = parseFootballDataKickoff(row.Date ?? "", row.Time, rowNumber, issues);
    if (!homeName || !awayName || !kickoffAt) continue;

    let payload = payloadByLeague.get(league.code);
    if (!payload) {
      payload = { league, teams: new Map(), fixtures: [], odds: [], fixtureIds: new Set() };
      payloadByLeague.set(league.code, payload);
    }
    const homeTeamId = footballDataTeamId(league.code, homeName);
    const awayTeamId = footballDataTeamId(league.code, awayName);
    payload.teams.set(homeTeamId, { id: homeTeamId, name: homeName, shortName: null, countryCode: league.countryCode });
    payload.teams.set(awayTeamId, { id: awayTeamId, name: awayName, shortName: null, countryCode: league.countryCode });
    const fixtureId = footballDataFixtureId(league.code, FOOTBALL_DATA_LIVE_SEASON.code, row.Date, homeName, awayName);
    if (payload.fixtureIds.has(fixtureId)) {
      issues.push(fieldIssue(rowNumber, null, "DUPLICATE_FIXTURE", "Aynı pilot fikstür akışta birden fazla kez bulunuyor."));
      continue;
    }
    payload.fixtureIds.add(fixtureId);
    payload.fixtures.push({
      id: fixtureId,
      kickoffAt,
      homeTeamId,
      awayTeamId,
      status: "scheduled",
      homeScore: null,
      awayScore: null,
    });

    for (const bookmaker of BOOKMAKER_COLUMNS) {
      const triple = [row[`${bookmaker.code}H`], row[`${bookmaker.code}D`], row[`${bookmaker.code}A`]];
      if (triple.every((value) => !value?.trim())) continue;
      const prices = triple.map(decimalOdds);
      if (prices.some((value) => value === null)) {
        ignoredIncompleteOddsTriples += 1;
        continue;
      }
      (["1", "X", "2"] as const).forEach((selection, selectionIndex) => {
        payload!.odds.push({
          id: `fdq:${footballDataStableHash(`${fixtureId}|${bookmaker.code}|${selection}|${capturedAt}`)}`,
          fixtureId,
          bookmaker: bookmaker.label,
          market: "1X2",
          selection,
          line: null,
          decimalOdds: prices[selectionIndex]!,
          capturedAt,
        });
      });
    }
  }

  if (issues.length) throw new FootballDataSourceError(issues.slice(0, 100));
  const qualityIssues: DataQualityIssue[] = [
    qualityIssue("SOURCE_COMMERCIAL_RIGHTS_REVIEW", "Fikstür akışının ticari yeniden kullanım hakkı ayrıca doğrulanana kadar veri research-only kalır.", "source"),
    qualityIssue("SOURCE_REVISION_TIME_UNVERIFIED", "Fikstür satırlarının ilk yayın ve revizyon zamanları doğrulanamadı.", "source"),
    qualityIssue("SOURCE_TIMEZONE_UNVERIFIED", "Kaynak saatleri timezone taşımadığı için tarihsel adaptörle aynı UTC-benzeri yorum kullanıldı.", "dataset"),
    qualityIssue("MARKET_CAPTURE_TIME_UNVERIFIED", "Oranların upstream yakalama zamanı bilinmiyor; fetch zamanı yalnız araştırma snapshot zamanı olarak kaydedildi.", "odds"),
    qualityIssue("ADVANCED_FIELDS_UNAVAILABLE", "Fikstür akışı kadro, xG, baskı ve ceza sahası girişi verisi sağlamıyor.", "dataset"),
  ];

  const envelopes = [...payloadByLeague.values()]
    .sort((first, second) => first.league.code.localeCompare(second.league.code))
    .map(({ league, teams, fixtures, odds }) => ({
      source: {
        name: FOOTBALL_DATA_SOURCE_NAME,
        baseUrl: FOOTBALL_DATA_FIXTURE_FEED_URL,
        acquisitionMethod: "public_dataset" as const,
        legalStatus: "review" as const,
      },
      capturedAt,
      payload: {
        league: {
          id: league.id,
          countryCode: league.countryCode,
          name: league.name,
          tier: league.tier,
          coverageLevel: "basic" as const,
        },
        season: FOOTBALL_DATA_LIVE_SEASON.label,
        teams: [...teams.values()].sort((first, second) => first.id.localeCompare(second.id)),
        fixtures: fixtures.sort((first, second) => first.kickoffAt.localeCompare(second.kickoffAt) || first.id.localeCompare(second.id)),
        stats: [],
        odds,
        lineups: [],
      },
    }));

  return {
    envelopes,
    qualityIssues,
    sourceRowCount,
    pilotRowCount,
    oddsSnapshotCount: envelopes.reduce((total, envelope) => total + envelope.payload.odds.length, 0),
    ignoredIncompleteOddsTriples,
  };
}

function decimalOdds(value: string | undefined) {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1.01 && parsed <= 1000 ? parsed : null;
}

function validIso(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw sourceError("INVALID_CAPTURE_TIME", "capturedAt geçerli ISO zamanı olmalıdır.");
  return date.toISOString();
}

function sourceError(code: string, message: string) {
  return new FootballDataSourceError([{ row: null, field: null, code, message }]);
}

function fieldIssue(row: number, field: string | null, code: string, message: string): FootballDataSourceIssue {
  return { row, field, code, message };
}

function qualityIssue(code: string, message: string, entityType: DataQualityIssue["entityType"]): DataQualityIssue {
  return { severity: "warning", code, message, entityType };
}
