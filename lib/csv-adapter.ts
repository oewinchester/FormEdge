export type CsvTeam = {
  externalKey: string;
  name: string;
  countryCode: string;
};

export type CsvTeamStats = {
  possession: number | null;
  shots: number | null;
  shotsOnTarget: number | null;
  expectedGoals: number | null;
  dangerousAttacks: number | null;
  penaltyAreaEntries: number | null;
  ppda: number | null;
  bigChancesAllowed: number | null;
};

export type CsvFixtureRow = {
  rowNumber: number;
  externalFixtureKey: string;
  kickoffAt: string;
  status: "scheduled" | "live" | "finished" | "postponed" | "cancelled";
  home: CsvTeam;
  away: CsvTeam;
  homeScore: number | null;
  awayScore: number | null;
  homeStats: CsvTeamStats;
  awayStats: CsvTeamStats;
  odds: {
    bookmaker: string | null;
    home: number | null;
    draw: number | null;
    away: number | null;
  };
};

export type FootballCsvDataset = {
  league: {
    externalKey: string;
    name: string;
    countryCode: string;
    coverageLevel: "basic" | "advanced" | "verified";
  };
  season: string;
  rows: CsvFixtureRow[];
};

export type CsvAdapterIssue = {
  row: number | null;
  field: string | null;
  code: string;
  message: string;
};

export class CsvAdapterError extends Error {
  issues: CsvAdapterIssue[];

  constructor(issues: CsvAdapterIssue[]) {
    super(issues[0]?.message ?? "CSV verisi doğrulanamadı.");
    this.issues = issues;
  }
}

const REQUIRED_COLUMNS = [
  "league_id",
  "league_name",
  "country_code",
  "season",
  "fixture_id",
  "kickoff_at",
  "home_team_id",
  "home_team_name",
  "away_team_id",
  "away_team_name",
] as const;

const HEADER_ALIASES: Record<string, string> = {
  competition_id: "league_id",
  lig_id: "league_id",
  competition_name: "league_name",
  lig_adi: "league_name",
  country: "country_code",
  ulke_kodu: "country_code",
  match_id: "fixture_id",
  mac_id: "fixture_id",
  date: "kickoff_at",
  kickoff: "kickoff_at",
  mac_tarihi: "kickoff_at",
  home_id: "home_team_id",
  ev_sahibi_id: "home_team_id",
  home_name: "home_team_name",
  ev_sahibi: "home_team_name",
  away_id: "away_team_id",
  deplasman_id: "away_team_id",
  away_name: "away_team_name",
  deplasman: "away_team_name",
  home_xg: "home_expected_goals",
  away_xg: "away_expected_goals",
  odds_1: "home_odds",
  odds_x: "draw_odds",
  odds_2: "away_odds",
};

export function parseFootballCsv(csv: string): FootballCsvDataset {
  if (!csv.trim()) throw new CsvAdapterError([{ row: null, field: null, code: "EMPTY_FILE", message: "CSV içeriği boş." }]);
  if (new TextEncoder().encode(csv).byteLength > 2_000_000) {
    throw new CsvAdapterError([{ row: null, field: null, code: "FILE_TOO_LARGE", message: "CSV beta sınırı olan 2 MB’ı aşıyor." }]);
  }

  const matrix = parseDelimited(csv);
  if (matrix.length < 2) {
    throw new CsvAdapterError([{ row: null, field: null, code: "NO_DATA_ROWS", message: "CSV başlık dışında en az bir veri satırı içermelidir." }]);
  }
  const headers = matrix[0].map(canonicalHeader);
  const duplicates = headers.filter((header, index) => headers.indexOf(header) !== index);
  const missing = REQUIRED_COLUMNS.filter((column) => !headers.includes(column));
  const issues: CsvAdapterIssue[] = [];
  for (const column of new Set(duplicates)) issues.push({ row: 1, field: column, code: "DUPLICATE_COLUMN", message: `“${column}” kolonu birden fazla kez tanımlanmış.` });
  for (const column of missing) issues.push({ row: 1, field: column, code: "MISSING_COLUMN", message: `Zorunlu “${column}” kolonu bulunamadı.` });
  if (issues.length) throw new CsvAdapterError(issues);

  const seenFixtures = new Set<string>();
  const rows: CsvFixtureRow[] = [];
  let leagueIdentity: string | null = null;
  let league: FootballCsvDataset["league"] | null = null;
  let season = "";

  for (let index = 1; index < matrix.length; index += 1) {
    if (matrix[index].every((cell) => !cell.trim())) continue;
    const rowNumber = index + 1;
    const row = Object.fromEntries(headers.map((header, cellIndex) => [header, matrix[index][cellIndex]?.trim() ?? ""]));
    const required = (field: string) => {
      const value = row[field]?.trim();
      if (!value) issues.push({ row: rowNumber, field, code: "REQUIRED_VALUE", message: `${rowNumber}. satırda “${field}” boş bırakılamaz.` });
      return value ?? "";
    };

    const externalFixtureKey = required("fixture_id");
    const leagueKey = required("league_id");
    const leagueName = required("league_name");
    const countryCode = required("country_code").toUpperCase();
    const rowSeason = required("season");
    const homeKey = required("home_team_id");
    const homeName = required("home_team_name");
    const awayKey = required("away_team_id");
    const awayName = required("away_team_name");
    const kickoffAt = parseDate(required("kickoff_at"), rowNumber, "kickoff_at", issues);

    if (!/^[A-Z]{2,3}$/.test(countryCode)) issues.push({ row: rowNumber, field: "country_code", code: "COUNTRY_CODE", message: `${rowNumber}. satırdaki ülke kodu 2–3 harf olmalıdır.` });
    if (externalFixtureKey && seenFixtures.has(externalFixtureKey)) issues.push({ row: rowNumber, field: "fixture_id", code: "DUPLICATE_FIXTURE", message: `“${externalFixtureKey}” fikstürü CSV içinde tekrar ediyor.` });
    seenFixtures.add(externalFixtureKey);
    if (homeKey && awayKey && homeKey === awayKey) issues.push({ row: rowNumber, field: "away_team_id", code: "SAME_TEAM", message: "Ev ve deplasman takımı aynı olamaz." });

    const identity = `${leagueKey}|${leagueName}|${countryCode}|${rowSeason}`;
    if (leagueIdentity && identity !== leagueIdentity) issues.push({ row: rowNumber, field: "league_id", code: "MULTIPLE_LEAGUES", message: "Bir CSV yalnızca tek lig ve sezon içerebilir." });
    if (!leagueIdentity) {
      leagueIdentity = identity;
      season = rowSeason;
      league = {
        externalKey: leagueKey,
        name: leagueName,
        countryCode,
        coverageLevel: parseCoverage(row.coverage_level),
      };
    }

    rows.push({
      rowNumber,
      externalFixtureKey,
      kickoffAt,
      status: parseStatus(row.status, rowNumber, issues),
      home: { externalKey: homeKey, name: homeName, countryCode },
      away: { externalKey: awayKey, name: awayName, countryCode },
      homeScore: numberValue(row.home_score, rowNumber, "home_score", issues, true),
      awayScore: numberValue(row.away_score, rowNumber, "away_score", issues, true),
      homeStats: stats(row, "home", rowNumber, issues),
      awayStats: stats(row, "away", rowNumber, issues),
      odds: {
        bookmaker: optional(row.bookmaker),
        home: oddsValue(row.home_odds, rowNumber, "home_odds", issues),
        draw: oddsValue(row.draw_odds, rowNumber, "draw_odds", issues),
        away: oddsValue(row.away_odds, rowNumber, "away_odds", issues),
      },
    });
  }

  if (issues.length) throw new CsvAdapterError(issues.slice(0, 100));
  if (!league || !rows.length) throw new CsvAdapterError([{ row: null, field: null, code: "NO_VALID_ROWS", message: "İşlenebilir CSV satırı bulunamadı." }]);
  return { league, season, rows };
}

function stats(row: Record<string, string>, side: "home" | "away", rowNumber: number, issues: CsvAdapterIssue[]): CsvTeamStats {
  return {
    possession: numberValue(row[`${side}_possession`], rowNumber, `${side}_possession`, issues),
    shots: numberValue(row[`${side}_shots`], rowNumber, `${side}_shots`, issues, true),
    shotsOnTarget: numberValue(row[`${side}_shots_on_target`], rowNumber, `${side}_shots_on_target`, issues, true),
    expectedGoals: numberValue(row[`${side}_expected_goals`], rowNumber, `${side}_expected_goals`, issues),
    dangerousAttacks: numberValue(row[`${side}_dangerous_attacks`], rowNumber, `${side}_dangerous_attacks`, issues, true),
    penaltyAreaEntries: numberValue(row[`${side}_penalty_area_entries`], rowNumber, `${side}_penalty_area_entries`, issues, true),
    ppda: numberValue(row[`${side}_ppda`], rowNumber, `${side}_ppda`, issues),
    bigChancesAllowed: numberValue(row[`${side}_big_chances_allowed`], rowNumber, `${side}_big_chances_allowed`, issues, true),
  };
}

function parseDelimited(csv: string): string[][] {
  const delimiter = detectDelimiter(csv.split(/\r?\n/, 1)[0] ?? "");
  const rows: string[][] = [[]];
  let value = "";
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];
    if (char === '"') {
      if (quoted && next === '"') { value += '"'; index += 1; } else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      rows[rows.length - 1].push(value); value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      rows[rows.length - 1].push(value); value = "";
      rows.push([]);
    } else value += char;
  }
  rows[rows.length - 1].push(value);
  if (rows.at(-1)?.length === 1 && !rows.at(-1)?.[0].trim()) rows.pop();
  return rows;
}

function detectDelimiter(header: string) {
  const candidates = [",", ";", "\t"];
  return candidates.map((delimiter) => ({ delimiter, count: header.split(delimiter).length - 1 }))
    .sort((a, b) => b.count - a.count)[0]?.delimiter ?? ",";
}

function canonicalHeader(value: string) {
  const normalized = value.replace(/^\uFEFF/, "").trim().toLowerCase().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return HEADER_ALIASES[normalized] ?? normalized;
}

function parseStatus(value: string | undefined, row: number, issues: CsvAdapterIssue[]): CsvFixtureRow["status"] {
  const normalized = (value || "scheduled").trim().toLowerCase().replace(/[ -]+/g, "_");
  const statuses: Record<string, CsvFixtureRow["status"]> = {
    scheduled: "scheduled", upcoming: "scheduled", not_started: "scheduled",
    live: "live", in_play: "live",
    finished: "finished", completed: "finished", ft: "finished",
    postponed: "postponed", cancelled: "cancelled", canceled: "cancelled",
  };
  const status = statuses[normalized];
  if (!status) issues.push({ row, field: "status", code: "STATUS", message: `${row}. satırdaki “${value}” maç durumu desteklenmiyor.` });
  return status ?? "scheduled";
}

function parseCoverage(value?: string): FootballCsvDataset["league"]["coverageLevel"] {
  const normalized = value?.trim().toLowerCase();
  return normalized === "verified" || normalized === "advanced" ? normalized : "basic";
}

function parseDate(value: string, row: number, field: string, issues: CsvAdapterIssue[]) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    issues.push({ row, field, code: "DATE", message: `${row}. satırdaki “${field}” geçerli bir ISO tarih değil.` });
    return new Date(0).toISOString();
  }
  return date.toISOString();
}

function numberValue(value: string | undefined, row: number, field: string, issues: CsvAdapterIssue[], integer = false): number | null {
  if (value == null || !value.trim()) return null;
  const parsed = Number(value.trim().replace(",", "."));
  if (!Number.isFinite(parsed) || (integer && !Number.isInteger(parsed))) {
    issues.push({ row, field, code: "NUMBER", message: `${row}. satırdaki “${field}” geçerli${integer ? " bir tam" : ""} sayı değil.` });
    return null;
  }
  return parsed;
}

function oddsValue(value: string | undefined, row: number, field: string, issues: CsvAdapterIssue[]) {
  const parsed = numberValue(value, row, field, issues);
  if (parsed != null && (parsed < 1.01 || parsed > 1000)) issues.push({ row, field, code: "ODDS_RANGE", message: `${row}. satırdaki “${field}” 1.01–1000 aralığında olmalıdır.` });
  return parsed;
}

function optional(value?: string) {
  const result = value?.trim();
  return result || null;
}

export const sampleFootballCsv = `league_id,league_name,country_code,season,coverage_level,fixture_id,kickoff_at,status,home_team_id,home_team_name,away_team_id,away_team_name,home_score,away_score,home_possession,away_possession,home_shots,away_shots,home_shots_on_target,away_shots_on_target,home_expected_goals,away_expected_goals,home_dangerous_attacks,away_dangerous_attacks,home_penalty_area_entries,away_penalty_area_entries,home_ppda,away_ppda,home_big_chances_allowed,away_big_chances_allowed,bookmaker,home_odds,draw_odds,away_odds
tr-super-lig,Süper Lig,TR,2026-27,advanced,sl-2026-001,2026-08-02T18:00:00Z,finished,atlas,Atlas İstanbul,kuzey,Kuzey 1967,2,0,61,39,17,7,7,2,2.14,0.62,54,24,31,13,8.7,14.2,1,4,Example International,1.72,3.60,5.10`;
