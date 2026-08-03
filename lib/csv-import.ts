import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLogs,
  fixtureMappings,
  fixtures,
  teamAliases,
  teams,
} from "@/db/schema";
import {
  buildSourceId,
  importFootballSnapshot,
  type AdminActor,
} from "@/lib/admin-data";
import {
  parseFootballCsv,
  type CsvFixtureRow,
  type CsvTeam,
} from "@/lib/csv-adapter";
import { type DataQualityIssue, evaluatePayloadQuality } from "@/lib/data-quality";
import {
  type AcquisitionMethod,
  type AdminImportEnvelope,
  type LegalStatus,
  type NormalizedFootballPayload,
  parseAdminImportEnvelope,
} from "@/lib/import-contract";

export type CsvImportRequest = {
  source: {
    name: string;
    baseUrl: string | null;
    acquisitionMethod: AcquisitionMethod;
    legalStatus: LegalStatus;
  };
  capturedAt: string;
  csv: string;
};

type AliasPlan = {
  id: string;
  externalTeamKey: string;
  externalTeamName: string;
  normalizedName: string;
  teamId: string;
  canonicalName: string;
  countryCode: string;
  status: "matched" | "review";
  confidence: number;
};

type FixturePlan = {
  id: string;
  externalFixtureKey: string;
  fixtureId: string;
  homeTeamId: string;
  awayTeamId: string;
  sourceKickoffAt: string;
  status: "matched" | "review";
  confidence: number;
};

export type CsvImportPreview = {
  envelope: AdminImportEnvelope;
  quality: ReturnType<typeof evaluatePayloadQuality>;
  summary: {
    csvRows: number;
    teams: number;
    fixtures: number;
    statsRows: number;
    oddsRows: number;
    aliasReviewCount: number;
    fixtureReviewCount: number;
  };
  aliasPlans: AliasPlan[];
  fixturePlans: FixturePlan[];
  issues: DataQualityIssue[];
};

export async function previewCsvImport(actor: AdminActor, input: CsvImportRequest): Promise<CsvImportPreview> {
  void actor;
  const dataset = parseFootballCsv(input.csv);
  const db = await getDb();
  const sourceId = await buildSourceId(input.source.name);
  const [knownTeams, knownAliases, knownFixtureMappings, knownFixtures] = await Promise.all([
    db.select().from(teams),
    db.select().from(teamAliases).where(eq(teamAliases.sourceId, sourceId)),
    db.select().from(fixtureMappings).where(eq(fixtureMappings.sourceId, sourceId)),
    db.select({
      id: fixtures.id,
      homeTeamId: fixtures.homeTeamId,
      awayTeamId: fixtures.awayTeamId,
      kickoffAt: fixtures.kickoffAt,
    }).from(fixtures).limit(5000),
  ]);

  const teamById = new Map(knownTeams.map((team) => [team.id, team]));
  const teamsByNormalized = new Map<string, typeof knownTeams>();
  for (const team of knownTeams) {
    const key = `${team.countryCode}:${normalizeTeamName(team.name)}`;
    const matches = teamsByNormalized.get(key) ?? [];
    matches.push(team);
    teamsByNormalized.set(key, matches);
  }
  const aliasesByExternalKey = new Map(knownAliases.map((alias) => [alias.externalTeamKey, alias]));
  const aliasPlans = new Map<string, AliasPlan>();
  const issues: DataQualityIssue[] = [];

  const resolveTeam = (sourceTeam: CsvTeam): AliasPlan => {
    const existingPlan = aliasPlans.get(sourceTeam.externalKey);
    if (existingPlan) {
      if (normalizeTeamName(existingPlan.externalTeamName) !== normalizeTeamName(sourceTeam.name)) {
        issues.push({
          severity: "warning",
          code: "TEAM_KEY_NAME_CHANGED",
          entityType: "alias",
          entityKey: sourceTeam.externalKey,
          field: "name",
          message: `“${sourceTeam.externalKey}” takım anahtarı CSV içinde birden fazla adla kullanılıyor.`,
        });
      }
      return existingPlan;
    }

    const normalizedName = normalizeTeamName(sourceTeam.name);
    const existingAlias = aliasesByExternalKey.get(sourceTeam.externalKey);
    const aliasTeam = existingAlias ? teamById.get(existingAlias.teamId) : null;
    const exactMatches = teamsByNormalized.get(`${sourceTeam.countryCode}:${normalizedName}`) ?? [];
    let teamId: string;
    let canonicalName: string;
    let status: AliasPlan["status"];
    let confidence: number;

    if (existingAlias && aliasTeam) {
      teamId = existingAlias.teamId;
      canonicalName = aliasTeam.name;
      status = existingAlias.status;
      confidence = existingAlias.confidence;
    } else if (exactMatches.length === 1) {
      teamId = exactMatches[0].id;
      canonicalName = exactMatches[0].name;
      status = "matched";
      confidence = 0.98;
    } else {
      teamId = canonicalId("team", `${sourceTeam.countryCode}:${normalizedName}`);
      canonicalName = sourceTeam.name.trim();
      status = "review";
      confidence = 0.72;
    }

    const plan: AliasPlan = {
      id: canonicalId("alias", `${sourceId}:${sourceTeam.externalKey}`),
      externalTeamKey: sourceTeam.externalKey,
      externalTeamName: sourceTeam.name,
      normalizedName,
      teamId,
      canonicalName,
      countryCode: sourceTeam.countryCode,
      status,
      confidence,
    };
    aliasPlans.set(sourceTeam.externalKey, plan);
    if (status === "review") {
      issues.push({
        severity: "warning",
        code: "TEAM_ALIAS_REVIEW",
        entityType: "alias",
        entityKey: sourceTeam.externalKey,
        message: `“${sourceTeam.name}” için yeni kanonik takım oluşturuldu; yönetici eşleme onayı gerekli.`,
        details: { proposedTeamId: teamId, confidence },
      });
    }
    return plan;
  };

  const resolvedRows = dataset.rows.map((row) => ({
    row,
    home: resolveTeam(row.home),
    away: resolveTeam(row.away),
  }));
  const mappingsByExternalKey = new Map(knownFixtureMappings.map((mapping) => [mapping.externalFixtureKey, mapping]));
  const fixturePlans: FixturePlan[] = [];
  const payloadFixtures: NormalizedFootballPayload["fixtures"] = [];
  const payloadStats: NormalizedFootballPayload["stats"] = [];
  const payloadOdds: NormalizedFootballPayload["odds"] = [];

  for (const { row, home, away } of resolvedRows) {
    const existingMapping = mappingsByExternalKey.get(row.externalFixtureKey);
    const kickoffTime = new Date(row.kickoffAt).getTime();
    const candidate = knownFixtures.find((fixture) => fixture.homeTeamId === home.teamId
      && fixture.awayTeamId === away.teamId
      && Math.abs(new Date(fixture.kickoffAt).getTime() - kickoffTime) <= 6 * 3_600_000);
    const fixtureId = existingMapping?.fixtureId
      ?? candidate?.id
      ?? canonicalId("fixture", `${sourceId}:${row.externalFixtureKey}`);
    const status: FixturePlan["status"] = existingMapping?.status
      ?? (candidate ? "matched" : "review");
    const confidence = existingMapping?.confidence ?? (candidate ? 0.94 : 0.75);
    const fixturePlan: FixturePlan = {
      id: canonicalId("fixture_map", `${sourceId}:${row.externalFixtureKey}`),
      externalFixtureKey: row.externalFixtureKey,
      fixtureId,
      homeTeamId: home.teamId,
      awayTeamId: away.teamId,
      sourceKickoffAt: row.kickoffAt,
      status,
      confidence,
    };
    fixturePlans.push(fixturePlan);
    if (status === "review") {
      issues.push({
        severity: "warning",
        code: "FIXTURE_MATCH_REVIEW",
        entityType: "fixture",
        entityKey: row.externalFixtureKey,
        message: `“${row.externalFixtureKey}” yeni fikstür olarak açıldı; çapraz kaynak eşleme onayı gerekli.`,
        details: { fixtureId, confidence },
      });
    }

    payloadFixtures.push({
      id: fixtureId,
      kickoffAt: row.kickoffAt,
      homeTeamId: home.teamId,
      awayTeamId: away.teamId,
      status: row.status,
      homeScore: row.homeScore,
      awayScore: row.awayScore,
    });
    pushStat(payloadStats, fixtureId, home.teamId, row.homeStats);
    pushStat(payloadStats, fixtureId, away.teamId, row.awayStats);
    pushOdds(payloadOdds, fixtureId, row, input.capturedAt);
  }

  const payload: NormalizedFootballPayload = {
    league: {
      id: canonicalId("league", `${dataset.league.countryCode}:${normalizeTeamName(dataset.league.name)}`),
      countryCode: dataset.league.countryCode,
      name: dataset.league.name,
      tier: null,
      coverageLevel: dataset.league.coverageLevel,
    },
    season: dataset.season,
    teams: Array.from(aliasPlans.values()).map((plan) => ({
      id: plan.teamId,
      name: plan.canonicalName,
      shortName: null,
      countryCode: plan.countryCode,
    })).filter((team, index, list) => list.findIndex((item) => item.id === team.id) === index),
    fixtures: payloadFixtures,
    stats: payloadStats,
    odds: payloadOdds,
    lineups: [],
  };
  const envelope = parseAdminImportEnvelope({
    source: input.source,
    capturedAt: input.capturedAt,
    payload,
  });
  const quality = evaluatePayloadQuality(envelope.payload, { capturedAt: envelope.capturedAt, externalIssues: issues });
  return {
    envelope,
    quality,
    summary: {
      csvRows: dataset.rows.length,
      teams: payload.teams.length,
      fixtures: payload.fixtures.length,
      statsRows: payload.stats.length,
      oddsRows: payload.odds.length,
      aliasReviewCount: Array.from(aliasPlans.values()).filter((plan) => plan.status === "review").length,
      fixtureReviewCount: fixturePlans.filter((plan) => plan.status === "review").length,
    },
    aliasPlans: Array.from(aliasPlans.values()),
    fixturePlans,
    issues,
  };
}

export async function importCsvSnapshot(actor: AdminActor, input: CsvImportRequest) {
  const preview = await previewCsvImport(actor, input);
  const result = await importFootballSnapshot(actor, preview.envelope, {
    importFormat: "csv",
    externalIssues: preview.issues,
  });
  const db = await getDb();
  const now = new Date().toISOString();

  if (preview.aliasPlans.length) {
    await db.insert(teamAliases).values(preview.aliasPlans.map((plan) => ({
      id: plan.id,
      sourceId: result.sourceId,
      externalTeamKey: plan.externalTeamKey,
      externalTeamName: plan.externalTeamName,
      normalizedName: plan.normalizedName,
      teamId: plan.teamId,
      status: plan.status,
      confidence: plan.confidence,
      createdByRunId: result.runId,
      updatedAt: now,
    }))).onConflictDoUpdate({
      target: [teamAliases.sourceId, teamAliases.externalTeamKey],
      set: {
        externalTeamName: sql`excluded.external_team_name`,
        normalizedName: sql`excluded.normalized_name`,
        teamId: sql`excluded.team_id`,
        status: sql`excluded.status`,
        confidence: sql`excluded.confidence`,
        updatedAt: now,
      },
    });
  }
  if (preview.fixturePlans.length) {
    await db.insert(fixtureMappings).values(preview.fixturePlans.map((plan) => ({
      ...plan,
      sourceId: result.sourceId,
      createdByRunId: result.runId,
      updatedAt: now,
    }))).onConflictDoUpdate({
      target: [fixtureMappings.sourceId, fixtureMappings.externalFixtureKey],
      set: {
        fixtureId: sql`excluded.fixture_id`,
        homeTeamId: sql`excluded.home_team_id`,
        awayTeamId: sql`excluded.away_team_id`,
        sourceKickoffAt: sql`excluded.source_kickoff_at`,
        status: sql`excluded.status`,
        confidence: sql`excluded.confidence`,
        updatedAt: now,
      },
    });
  }
  await db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    actorEmail: actor.email,
    action: "csv.mappings.created",
    entityType: "ingestion_run",
    entityId: result.runId,
    detailsJson: JSON.stringify(preview.summary),
  });
  return { ...result, summary: preview.summary };
}

function pushStat(
  target: NormalizedFootballPayload["stats"],
  fixtureId: string,
  teamId: string,
  values: CsvFixtureRow["homeStats"],
) {
  if (Object.values(values).every((value) => value == null)) return;
  target.push({ fixtureId, teamId, ...values });
}

function pushOdds(
  target: NormalizedFootballPayload["odds"],
  fixtureId: string,
  row: CsvFixtureRow,
  capturedAt: string,
) {
  if (!row.odds.bookmaker) return;
  for (const [selection, decimalOdds] of [["1", row.odds.home], ["X", row.odds.draw], ["2", row.odds.away]] as const) {
    if (decimalOdds == null) continue;
    target.push({
      id: canonicalId("odd", `${row.externalFixtureKey}:${row.odds.bookmaker}:${selection}`),
      fixtureId,
      bookmaker: row.odds.bookmaker,
      market: "1X2",
      selection,
      line: null,
      decimalOdds,
      capturedAt,
    });
  }
}

export function normalizeTeamName(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(fc|cf|fk|sk|spor|club|kulubu|futbol)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function canonicalId(prefix: string, source: string) {
  const slug = normalizeTeamName(source).replace(/\s+/g, "-").slice(0, 48) || "item";
  return `${prefix}-${slug}-${fnv1a(source)}`.slice(0, 96);
}

function fnv1a(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
