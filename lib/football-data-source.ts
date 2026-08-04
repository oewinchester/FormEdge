import type { DataQualityIssue } from "./data-quality.ts";
import type { AdminImportEnvelope, NormalizedFootballPayload } from "./import-contract.ts";

export const FOOTBALL_DATA_ADAPTER_VERSION = "football-data-csv-v1" as const;
export const FOOTBALL_DATA_SOURCE_NAME = "Football-Data.co.uk Research CSV" as const;
export const FOOTBALL_DATA_BASE_URL = "https://www.football-data.co.uk/" as const;
export const FOOTBALL_DATA_DATA_URL = "https://www.football-data.co.uk/data.php" as const;
export const FOOTBALL_DATA_NOTES_URL = "https://www.football-data.co.uk/notes.txt" as const;
export const FOOTBALL_DATA_MAX_BYTES = 3_000_000;

export const FOOTBALL_DATA_RESEARCH_SEASONS = [
  { code: "2122", label: "2021-22" },
  { code: "2223", label: "2022-23" },
  { code: "2324", label: "2023-24" },
  { code: "2425", label: "2024-25" },
  { code: "2526", label: "2025-26" },
] as const;

export const FOOTBALL_DATA_LIVE_SEASON = { code: "2627", label: "2026-27" } as const;

export const FOOTBALL_DATA_ALLOWED_SEASONS = [
  ...FOOTBALL_DATA_RESEARCH_SEASONS,
  FOOTBALL_DATA_LIVE_SEASON,
] as const;

export const FOOTBALL_DATA_PILOT_LEAGUES = [
  { code: "T1", id: "tr-super-lig", name: "Süper Lig", countryCode: "TR", tier: 1 },
  { code: "E0", id: "eng-premier-league", name: "Premier League", countryCode: "GB", tier: 1 },
  { code: "D1", id: "de-bundesliga", name: "Bundesliga", countryCode: "DE", tier: 1 },
  { code: "SP1", id: "es-la-liga", name: "La Liga", countryCode: "ES", tier: 1 },
  { code: "I1", id: "it-serie-a", name: "Serie A", countryCode: "IT", tier: 1 },
] as const;

export type FootballDataLeagueCode = typeof FOOTBALL_DATA_PILOT_LEAGUES[number]["code"];
export type FootballDataSeasonCode = typeof FOOTBALL_DATA_ALLOWED_SEASONS[number]["code"];

export type FootballDataSourceIssue = {
  row: number | null;
  field: string | null;
  code: string;
  message: string;
};

export class FootballDataSourceError extends Error {
  issues: FootballDataSourceIssue[];

  constructor(issues: FootballDataSourceIssue[]) {
    super(issues[0]?.message ?? "Football-Data CSV doğrulanamadı.");
    this.name = "FootballDataSourceError";
    this.issues = issues;
  }
}

export type ParsedFootballDataSource = {
  envelope: AdminImportEnvelope;
  qualityIssues: DataQualityIssue[];
  sourceRowCount: number;
  importedStatRowCount: number;
  ignoredOddsColumnCount: number;
  missingKickoffTimeCount: number;
};

export function resolveFootballDataSelection(leagueCode: unknown, seasonCode: unknown) {
  if (typeof leagueCode !== "string" || typeof seasonCode !== "string") {
    throw new FootballDataSourceError([issue(null, null, "SELECTION_REQUIRED", "Lig ve sezon seçimi gereklidir.")]);
  }
  const league = FOOTBALL_DATA_PILOT_LEAGUES.find((item) => item.code === leagueCode.trim());
  const season = FOOTBALL_DATA_ALLOWED_SEASONS.find((item) => item.code === seasonCode.trim());
  if (!league || !season) {
    throw new FootballDataSourceError([issue(
      null,
      null,
      "SELECTION_NOT_ALLOWLISTED",
      "Yalnız önceden tanımlanmış pilot lig ve sezonlar indirilebilir.",
    )]);
  }
  return { league, season };
}

export function buildFootballDataSourceUrl(leagueCode: unknown, seasonCode: unknown) {
  const { league, season } = resolveFootballDataSelection(leagueCode, seasonCode);
  return `https://www.football-data.co.uk/mmz4281/${season.code}/${league.code}.csv`;
}

export function parseFootballDataCsv(input: {
  csv: string;
  leagueCode: unknown;
  seasonCode: unknown;
  capturedAt: string;
}): ParsedFootballDataSource {
  const { league, season } = resolveFootballDataSelection(input.leagueCode, input.seasonCode);
  const capturedAt = validIso(input.capturedAt, "capturedAt");
  if (!input.csv.trim()) {
    throw new FootballDataSourceError([issue(null, null, "EMPTY_FILE", "Kaynak CSV içeriği boş.")]);
  }
  if (new TextEncoder().encode(input.csv).byteLength > FOOTBALL_DATA_MAX_BYTES) {
    throw new FootballDataSourceError([issue(null, null, "FILE_TOO_LARGE", "Kaynak CSV 3 MB güvenlik sınırını aşıyor.")]);
  }

  const matrix = parseFootballDataCsvMatrix(input.csv);
  if (matrix.length < 2) {
    throw new FootballDataSourceError([issue(null, null, "NO_DATA_ROWS", "Kaynak CSV veri satırı içermiyor.")]);
  }
  const headers = matrix[0].map((value) => value.replace(/^\uFEFF/, "").trim());
  const requiredHeaders = ["Div", "Date", "HomeTeam", "AwayTeam", "FTHG", "FTAG", "FTR"];
  const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));
  if (missingHeaders.length) {
    throw new FootballDataSourceError(missingHeaders.map((header) => issue(
      1,
      header,
      "MISSING_COLUMN",
      `Kaynak CSV zorunlu “${header}” kolonunu içermiyor.`,
    )));
  }

  const sourceIssues: FootballDataSourceIssue[] = [];
  const fixtureIds = new Set<string>();
  const teamsById = new Map<string, NormalizedFootballPayload["teams"][number]>();
  const fixtures: NormalizedFootballPayload["fixtures"] = [];
  const stats: NormalizedFootballPayload["stats"] = [];
  let missingKickoffTimeCount = 0;

  for (let index = 1; index < matrix.length; index += 1) {
    const cells = matrix[index];
    if (cells.every((cell) => !cell.trim())) continue;
    const rowNumber = index + 1;
    const row = Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex]?.trim() ?? ""]));
    if (row.Div !== league.code) {
      sourceIssues.push(issue(rowNumber, "Div", "DIVISION_MISMATCH", `Beklenen ${league.code}, bulunan ${row.Div || "boş"}.`));
      continue;
    }
    const homeName = required(row.HomeTeam, rowNumber, "HomeTeam", sourceIssues);
    const awayName = required(row.AwayTeam, rowNumber, "AwayTeam", sourceIssues);
    if (homeName && awayName && normalizeFootballDataTeamName(homeName) === normalizeFootballDataTeamName(awayName)) {
      sourceIssues.push(issue(rowNumber, "AwayTeam", "SAME_TEAM", "Ev ve deplasman takımı aynı olamaz."));
    }
    if (season.code === FOOTBALL_DATA_LIVE_SEASON.code
      && (!row.FTHG?.trim() || !row.FTAG?.trim() || !row.FTR?.trim())) {
      continue;
    }
    const homeScore = integer(row.FTHG, rowNumber, "FTHG", sourceIssues);
    const awayScore = integer(row.FTAG, rowNumber, "FTAG", sourceIssues);
    const date = required(row.Date, rowNumber, "Date", sourceIssues);
    const kickoffAt = parseFootballDataKickoff(date, row.Time, rowNumber, sourceIssues);
    if (!row.Time?.trim()) missingKickoffTimeCount += 1;
    if (!homeName || !awayName || homeScore === null || awayScore === null || !kickoffAt) continue;

    const actualResult = homeScore > awayScore ? "H" : homeScore < awayScore ? "A" : "D";
    if (row.FTR !== actualResult) {
      sourceIssues.push(issue(rowNumber, "FTR", "RESULT_MISMATCH", "FTR sonucu tam zaman skoru ile uyuşmuyor."));
      continue;
    }

    const homeTeamId = footballDataTeamId(league.code, homeName);
    const awayTeamId = footballDataTeamId(league.code, awayName);
    registerTeam(teamsById, homeTeamId, homeName, league.countryCode, rowNumber, sourceIssues);
    registerTeam(teamsById, awayTeamId, awayName, league.countryCode, rowNumber, sourceIssues);
    const fixtureId = footballDataFixtureId(league.code, season.code, date, homeName, awayName);
    if (fixtureIds.has(fixtureId)) {
      sourceIssues.push(issue(rowNumber, null, "DUPLICATE_FIXTURE", "Aynı kaynak fikstürü CSV içinde birden fazla kez bulunuyor."));
      continue;
    }
    fixtureIds.add(fixtureId);
    fixtures.push({
      id: fixtureId,
      kickoffAt,
      homeTeamId,
      awayTeamId,
      status: "finished",
      homeScore,
      awayScore,
    });

    const homeShots = optionalInteger(row.HS, rowNumber, "HS", sourceIssues);
    const awayShots = optionalInteger(row.AS, rowNumber, "AS", sourceIssues);
    const homeShotsOnTarget = optionalInteger(row.HST, rowNumber, "HST", sourceIssues);
    const awayShotsOnTarget = optionalInteger(row.AST, rowNumber, "AST", sourceIssues);
    if ([homeShots, awayShots, homeShotsOnTarget, awayShotsOnTarget].some((value) => value !== null)) {
      stats.push(
        sourceStats(fixtureId, homeTeamId, homeShots, homeShotsOnTarget),
        sourceStats(fixtureId, awayTeamId, awayShots, awayShotsOnTarget),
      );
    }
  }

  if (sourceIssues.length) throw new FootballDataSourceError(sourceIssues.slice(0, 100));
  if (!fixtures.length) {
    throw new FootballDataSourceError([issue(null, null, "NO_VALID_FIXTURES", "Kaynak CSV içinde doğrulanmış maç bulunamadı.")]);
  }

  const ignoredOddsColumnCount = headers.filter((header) => isOddsHeader(header)).length;
  const qualityIssues: DataQualityIssue[] = [
    qualityIssue("SOURCE_COMMERCIAL_RIGHTS_REVIEW", "Kaynak nicel test için ücretsizdir; ticari yeniden kullanım hakkı ayrıca doğrulanmadan yayın verisi olamaz.", "source"),
    qualityIssue("SOURCE_REVISION_TIME_UNVERIFIED", "Tarihsel satırların ilk yayın ve revizyon zamanları doğrulanamadığı için veri research-only tutulur.", "source"),
    qualityIssue("SOURCE_TIMEZONE_UNVERIFIED", "Kaynak kickoff saatleri açık timezone taşımıyor; adaptör kronoloji için UTC-benzeri sabit yorum kullanır.", "dataset"),
    qualityIssue("ADVANCED_FIELDS_UNAVAILABLE", "Kaynak şut ve isabetli şut sağlar; xG, baskı ve ceza sahası girişi alanları yoktur.", "dataset"),
    qualityIssue("MARKET_CAPTURE_TIME_UNAVAILABLE", "Oran kolonlarında kesin capture zamanı olmadığı için oddsSnapshots tablosuna yazılmadı.", "odds", { ignoredOddsColumnCount }),
  ];
  if (missingKickoffTimeCount) {
    qualityIssues.push(qualityIssue(
      "KICKOFF_TIME_ASSUMED",
      `${missingKickoffTimeCount} maçta saat bulunmadığı için 12:00 sabit zamanı kullanıldı.`,
      "dataset",
      { missingKickoffTimeCount },
    ));
  }

  return {
    envelope: {
      source: {
        name: FOOTBALL_DATA_SOURCE_NAME,
        baseUrl: FOOTBALL_DATA_DATA_URL,
        acquisitionMethod: "public_dataset",
        legalStatus: "review",
      },
      capturedAt,
      payload: {
        league: {
          id: league.id,
          countryCode: league.countryCode,
          name: league.name,
          tier: league.tier,
          coverageLevel: "basic",
        },
        season: season.label,
        teams: [...teamsById.values()].sort((first, second) => first.id.localeCompare(second.id)),
        fixtures: fixtures.sort((first, second) => first.kickoffAt.localeCompare(second.kickoffAt) || first.id.localeCompare(second.id)),
        stats,
        odds: [],
        lineups: [],
      },
    },
    qualityIssues,
    sourceRowCount: fixtures.length,
    importedStatRowCount: stats.length,
    ignoredOddsColumnCount,
    missingKickoffTimeCount,
  };
}

function sourceStats(
  fixtureId: string,
  teamIdValue: string,
  shots: number | null,
  shotsOnTarget: number | null,
): NormalizedFootballPayload["stats"][number] {
  return {
    fixtureId,
    teamId: teamIdValue,
    possession: null,
    shots,
    shotsOnTarget,
    expectedGoals: null,
    dangerousAttacks: null,
    penaltyAreaEntries: null,
    ppda: null,
    bigChancesAllowed: null,
  };
}

function registerTeam(
  map: Map<string, NormalizedFootballPayload["teams"][number]>,
  id: string,
  name: string,
  countryCode: string,
  row: number,
  issues: FootballDataSourceIssue[],
) {
  const existing = map.get(id);
  if (existing && normalizeFootballDataTeamName(existing.name) !== normalizeFootballDataTeamName(name)) {
    issues.push(issue(row, null, "TEAM_ID_COLLISION", "İki farklı takım aynı deterministik kimliği üretti."));
    return;
  }
  if (!existing) map.set(id, { id, name, shortName: null, countryCode });
}

export function footballDataFixtureId(code: string, season: string, date: string, home: string, away: string) {
  const dateKey = date.replace(/[^0-9]/g, "");
  return `fd:${code.toLowerCase()}:${season}:${dateKey}:${footballDataStableHash(`${normalizeFootballDataTeamName(home)}|${normalizeFootballDataTeamName(away)}`)}`;
}

export function footballDataTeamId(code: string, name: string) {
  return `fd:${code.toLowerCase()}:team:${footballDataStableHash(normalizeFootballDataTeamName(name))}`;
}

export function footballDataStableHash(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
}

export function normalizeFootballDataTeamName(value: string) {
  return value.trim().toLocaleLowerCase("en-US").normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

export function parseFootballDataKickoff(
  dateValue: string,
  timeValue: string | undefined,
  row: number,
  issues: FootballDataSourceIssue[],
) {
  const dateMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dateValue.trim());
  if (!dateMatch) {
    issues.push(issue(row, "Date", "DATE_FORMAT", "Tarih DD/MM/YYYY biçiminde olmalıdır."));
    return null;
  }
  const time = timeValue?.trim() || "12:00";
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!timeMatch) {
    issues.push(issue(row, "Time", "TIME_FORMAT", "Saat HH:MM biçiminde olmalıdır."));
    return null;
  }
  const day = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const year = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const value = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (value.getUTCFullYear() !== year || value.getUTCMonth() !== month - 1 || value.getUTCDate() !== day
    || value.getUTCHours() !== hour || value.getUTCMinutes() !== minute) {
    issues.push(issue(row, "Date", "DATE_RANGE", "Kaynak tarih veya saat değeri geçerli aralıkta değil."));
    return null;
  }
  return value.toISOString();
}

function required(value: string | undefined, row: number, field: string, issues: FootballDataSourceIssue[]) {
  const normalized = value?.trim() ?? "";
  if (!normalized) issues.push(issue(row, field, "REQUIRED_VALUE", `${field} boş olamaz.`));
  return normalized;
}

function integer(value: string | undefined, row: number, field: string, issues: FootballDataSourceIssue[]) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    issues.push(issue(row, field, "NON_NEGATIVE_INTEGER", `${field} negatif olmayan tam sayı olmalıdır.`));
    return null;
  }
  return parsed;
}

function optionalInteger(value: string | undefined, row: number, field: string, issues: FootballDataSourceIssue[]) {
  if (!value?.trim()) return null;
  return integer(value, row, field, issues);
}

function validIso(value: string, field: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new FootballDataSourceError([issue(null, field, "INVALID_ISO_TIME", `${field} geçerli ISO zamanı olmalıdır.`)]);
  }
  return parsed.toISOString();
}

export function parseFootballDataCsvMatrix(csv: string) {
  const rows: string[][] = [[]];
  let value = "";
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    const next = csv[index + 1];
    if (character === '"') {
      if (quoted && next === '"') { value += '"'; index += 1; } else quoted = !quoted;
    } else if (character === "," && !quoted) {
      rows[rows.length - 1].push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      rows[rows.length - 1].push(value);
      value = "";
      rows.push([]);
    } else {
      value += character;
    }
  }
  rows[rows.length - 1].push(value);
  if (rows.at(-1)?.length === 1 && !rows.at(-1)?.[0].trim()) rows.pop();
  return rows;
}

function isOddsHeader(value: string) {
  return /^(?:B365|BF|BFD|BMG|BV|BW|CL|LB|PS|Max|Avg|P)[A-Z0-9<>.]*$/.test(value);
}

function qualityIssue(
  code: string,
  message: string,
  entityType: DataQualityIssue["entityType"],
  details?: Record<string, unknown>,
): DataQualityIssue {
  return { severity: "warning", code, message, entityType, details };
}

function issue(row: number | null, field: string | null, code: string, message: string): FootballDataSourceIssue {
  return { row, field, code, message };
}
