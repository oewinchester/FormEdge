export type AcquisitionMethod = "manual_export" | "public_dataset" | "licensed_feed";
export type LegalStatus = "approved" | "review" | "blocked";

export type AdminImportEnvelope = {
  source: {
    name: string;
    baseUrl: string | null;
    acquisitionMethod: AcquisitionMethod;
    legalStatus: LegalStatus;
  };
  capturedAt: string;
  payload: NormalizedFootballPayload;
};

export type NormalizedFootballPayload = {
  league: {
    id: string;
    countryCode: string;
    name: string;
    tier: number | null;
    coverageLevel: "basic" | "advanced" | "verified";
  };
  season: string;
  teams: Array<{
    id: string;
    name: string;
    shortName: string | null;
    countryCode: string;
  }>;
  fixtures: Array<{
    id: string;
    kickoffAt: string;
    homeTeamId: string;
    awayTeamId: string;
    status: "scheduled" | "live" | "finished" | "postponed" | "cancelled";
    homeScore: number | null;
    awayScore: number | null;
  }>;
  stats: Array<{
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
  }>;
  odds: Array<{
    id: string;
    fixtureId: string;
    bookmaker: string;
    market: string;
    selection: string;
    line: number | null;
    decimalOdds: number;
    capturedAt: string;
  }>;
  lineups: Array<{
    id: string;
    fixtureId: string;
    teamId: string;
    status: "probable" | "confirmed";
    players: unknown[];
    unavailablePlayers: unknown[];
    capturedAt: string;
  }>;
};

const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,95}$/;

export function parseAdminImportEnvelope(value: unknown): AdminImportEnvelope {
  const root = asRecord(value, "request");
  const source = asRecord(root.source, "source");
  const acquisitionMethod = asEnum(
    source.acquisitionMethod,
    "source.acquisitionMethod",
    ["manual_export", "public_dataset", "licensed_feed"] as const,
  );
  const legalStatus = asEnum(
    source.legalStatus,
    "source.legalStatus",
    ["approved", "review", "blocked"] as const,
  );

  if (legalStatus === "blocked") {
    throw new Error("Blocked sources cannot be imported.");
  }

  return {
    source: {
      name: asString(source.name, "source.name", 120),
      baseUrl: asOptionalUrl(source.baseUrl, "source.baseUrl"),
      acquisitionMethod,
      legalStatus,
    },
    capturedAt: asIsoDate(root.capturedAt, "capturedAt"),
    payload: parseFootballPayload(root.payload),
  };
}

export function recordCount(payload: NormalizedFootballPayload): number {
  return payload.teams.length
    + payload.fixtures.length
    + payload.stats.length
    + payload.odds.length
    + payload.lineups.length;
}

function parseFootballPayload(value: unknown): NormalizedFootballPayload {
  const root = asRecord(value, "payload");
  const league = asRecord(root.league, "payload.league");
  const coverageLevel = asEnum(
    league.coverageLevel ?? "basic",
    "payload.league.coverageLevel",
    ["basic", "advanced", "verified"] as const,
  );
  const season = asString(root.season, "payload.season", 24);

  const teams = asArray(root.teams, "payload.teams", 500).map((item, index) => {
    const row = asRecord(item, `payload.teams[${index}]`);
    return {
      id: asId(row.id, `payload.teams[${index}].id`),
      name: asString(row.name, `payload.teams[${index}].name`, 140),
      shortName: asOptionalString(row.shortName, `payload.teams[${index}].shortName`, 60),
      countryCode: asCountryCode(row.countryCode, `payload.teams[${index}].countryCode`),
    };
  });
  const teamIds = new Set(teams.map((team) => team.id));

  const fixtures = asArray(root.fixtures, "payload.fixtures", 1500).map((item, index) => {
    const path = `payload.fixtures[${index}]`;
    const row = asRecord(item, path);
    const homeTeamId = asId(row.homeTeamId, `${path}.homeTeamId`);
    const awayTeamId = asId(row.awayTeamId, `${path}.awayTeamId`);
    if (!teamIds.has(homeTeamId) || !teamIds.has(awayTeamId)) {
      throw new Error(`${path} references a team missing from payload.teams.`);
    }
    if (homeTeamId === awayTeamId) throw new Error(`${path} cannot use the same team twice.`);
    const status = asEnum(
      row.status ?? "scheduled",
      `${path}.status`,
      ["scheduled", "live", "finished", "postponed", "cancelled"] as const,
    );
    return {
      id: asId(row.id, `${path}.id`),
      kickoffAt: asIsoDate(row.kickoffAt, `${path}.kickoffAt`),
      homeTeamId,
      awayTeamId,
      status,
      homeScore: asOptionalNumber(row.homeScore, `${path}.homeScore`, true),
      awayScore: asOptionalNumber(row.awayScore, `${path}.awayScore`, true),
    };
  });
  const fixtureIds = new Set(fixtures.map((fixture) => fixture.id));

  const stats = asArray(root.stats ?? [], "payload.stats", 3000).map((item, index) => {
    const path = `payload.stats[${index}]`;
    const row = asRecord(item, path);
    const fixtureId = asId(row.fixtureId, `${path}.fixtureId`);
    const teamId = asId(row.teamId, `${path}.teamId`);
    requireReferences(path, fixtureId, teamId, fixtureIds, teamIds);
    return {
      fixtureId,
      teamId,
      possession: asOptionalNumber(row.possession, `${path}.possession`),
      shots: asOptionalNumber(row.shots, `${path}.shots`, true),
      shotsOnTarget: asOptionalNumber(row.shotsOnTarget, `${path}.shotsOnTarget`, true),
      expectedGoals: asOptionalNumber(row.expectedGoals, `${path}.expectedGoals`),
      dangerousAttacks: asOptionalNumber(row.dangerousAttacks, `${path}.dangerousAttacks`, true),
      penaltyAreaEntries: asOptionalNumber(row.penaltyAreaEntries, `${path}.penaltyAreaEntries`, true),
      ppda: asOptionalNumber(row.ppda, `${path}.ppda`),
      bigChancesAllowed: asOptionalNumber(row.bigChancesAllowed, `${path}.bigChancesAllowed`, true),
    };
  });

  const odds = asArray(root.odds ?? [], "payload.odds", 8000).map((item, index) => {
    const path = `payload.odds[${index}]`;
    const row = asRecord(item, path);
    const fixtureId = asId(row.fixtureId, `${path}.fixtureId`);
    if (!fixtureIds.has(fixtureId)) throw new Error(`${path} references a missing fixture.`);
    const decimalOdds = asNumber(row.decimalOdds, `${path}.decimalOdds`);
    if (decimalOdds < 1.01 || decimalOdds > 1000) throw new Error(`${path}.decimalOdds is outside the accepted range.`);
    return {
      id: asId(row.id, `${path}.id`),
      fixtureId,
      bookmaker: asString(row.bookmaker, `${path}.bookmaker`, 80),
      market: asString(row.market, `${path}.market`, 80),
      selection: asString(row.selection, `${path}.selection`, 100),
      line: asOptionalNumber(row.line, `${path}.line`),
      decimalOdds,
      capturedAt: asIsoDate(row.capturedAt, `${path}.capturedAt`),
    };
  });

  const lineups = asArray(root.lineups ?? [], "payload.lineups", 3000).map((item, index) => {
    const path = `payload.lineups[${index}]`;
    const row = asRecord(item, path);
    const fixtureId = asId(row.fixtureId, `${path}.fixtureId`);
    const teamId = asId(row.teamId, `${path}.teamId`);
    requireReferences(path, fixtureId, teamId, fixtureIds, teamIds);
    return {
      id: asId(row.id, `${path}.id`),
      fixtureId,
      teamId,
      status: asEnum(row.status, `${path}.status`, ["probable", "confirmed"] as const),
      players: asArray(row.players, `${path}.players`, 40),
      unavailablePlayers: asArray(row.unavailablePlayers ?? [], `${path}.unavailablePlayers`, 40),
      capturedAt: asIsoDate(row.capturedAt, `${path}.capturedAt`),
    };
  });

  return {
    league: {
      id: asId(league.id, "payload.league.id"),
      countryCode: asCountryCode(league.countryCode, "payload.league.countryCode"),
      name: asString(league.name, "payload.league.name", 120),
      tier: asOptionalNumber(league.tier, "payload.league.tier", true),
      coverageLevel,
    },
    season,
    teams,
    fixtures,
    stats,
    odds,
    lineups,
  };
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown, path: string, max: number): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array.`);
  if (value.length > max) throw new Error(`${path} exceeds the ${max}-record limit.`);
  return value;
}

function asString(value: unknown, path: string, max: number): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${path} is required.`);
  const result = value.trim();
  if (result.length > max) throw new Error(`${path} exceeds ${max} characters.`);
  return result;
}

function asOptionalString(value: unknown, path: string, max: number): string | null {
  if (value == null || value === "") return null;
  return asString(value, path, max);
}

function asId(value: unknown, path: string): string {
  const result = asString(value, path, 96);
  if (!ID_PATTERN.test(result)) throw new Error(`${path} contains unsupported characters.`);
  return result;
}

function asCountryCode(value: unknown, path: string): string {
  const result = asString(value, path, 3).toUpperCase();
  if (!/^[A-Z]{2,3}$/.test(result)) throw new Error(`${path} must be a 2–3 letter country code.`);
  return result;
}

function asNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${path} must be a finite number.`);
  return value;
}

function asOptionalNumber(value: unknown, path: string, integer = false): number | null {
  if (value == null || value === "") return null;
  const result = asNumber(value, path);
  if (integer && !Number.isInteger(result)) throw new Error(`${path} must be an integer.`);
  return result;
}

function asIsoDate(value: unknown, path: string): string {
  const result = asString(value, path, 40);
  const date = new Date(result);
  if (Number.isNaN(date.getTime())) throw new Error(`${path} must be a valid ISO date.`);
  return date.toISOString();
}

function asOptionalUrl(value: unknown, path: string): string | null {
  if (value == null || value === "") return null;
  const result = asString(value, path, 500);
  let url: URL;
  try {
    url = new URL(result);
  } catch {
    throw new Error(`${path} must be a valid URL.`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`${path} must use HTTP or HTTPS.`);
  }
  return url.toString();
}

function asEnum<const T extends readonly string[]>(value: unknown, path: string, options: T): T[number] {
  if (typeof value !== "string" || !(options as readonly string[]).includes(value)) {
    throw new Error(`${path} must be one of: ${options.join(", ")}.`);
  }
  return value as T[number];
}

function requireReferences(
  path: string,
  fixtureId: string,
  teamId: string,
  fixtureIds: Set<string>,
  teamIds: Set<string>,
) {
  if (!fixtureIds.has(fixtureId)) throw new Error(`${path} references a missing fixture.`);
  if (!teamIds.has(teamId)) throw new Error(`${path} references a missing team.`);
}

export const sampleImportEnvelope: AdminImportEnvelope = {
  source: {
    name: "Controlled beta sample",
    baseUrl: "https://example.com/manual-export",
    acquisitionMethod: "manual_export",
    legalStatus: "review",
  },
  capturedAt: "2026-08-03T18:30:00.000Z",
  payload: {
    league: {
      id: "tr-super-lig",
      countryCode: "TR",
      name: "Süper Lig",
      tier: 1,
      coverageLevel: "advanced",
    },
    season: "2026-27",
    teams: [
      { id: "atlas-istanbul", name: "Atlas İstanbul", shortName: "ATL", countryCode: "TR" },
      { id: "kuzey-1967", name: "Kuzey 1967", shortName: "KZY", countryCode: "TR" },
    ],
    fixtures: [
      {
        id: "trsl-2026-001",
        kickoffAt: "2026-08-09T17:00:00.000Z",
        homeTeamId: "atlas-istanbul",
        awayTeamId: "kuzey-1967",
        status: "scheduled",
        homeScore: null,
        awayScore: null,
      },
    ],
    stats: [],
    odds: [
      {
        id: "odd-trsl-001-home",
        fixtureId: "trsl-2026-001",
        bookmaker: "Example International",
        market: "1X2",
        selection: "1",
        line: null,
        decimalOdds: 1.78,
        capturedAt: "2026-08-03T18:30:00.000Z",
      },
    ],
    lineups: [],
  },
};
