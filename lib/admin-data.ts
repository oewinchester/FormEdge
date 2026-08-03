import { count, desc, eq, sql } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import {
  appMembers,
  auditLogs,
  dataSources,
  fixtureMappings,
  fixtures,
  ingestionIssues,
  ingestionRuns,
  leagues,
  lineupSnapshots,
  oddsSnapshots,
  teamAliases,
  teamMatchStats,
  teams,
} from "@/db/schema";
import { type DataQualityIssue, evaluatePayloadQuality } from "@/lib/data-quality";
import {
  type AdminImportEnvelope,
  recordCount,
} from "@/lib/import-contract";

export type AdminActor = {
  email: string;
  displayName: string;
  role: "admin" | "editor";
};

export type ImportOptions = {
  importFormat?: "json" | "csv";
  externalIssues?: DataQualityIssue[];
};

export class AdminAccessError extends Error {
  constructor(public status: 400 | 401 | 403 | 404, message: string) {
    super(message);
  }
}

export async function requireAdminActor(): Promise<AdminActor> {
  const user = await getChatGPTUser();
  if (!user) throw new AdminAccessError(401, "Sign in is required.");

  const db = await getDb();
  let [member] = await db.select().from(appMembers).where(eq(appMembers.email, user.email)).limit(1);

  if (!member) {
    const [{ total }] = await db.select({ total: count() }).from(appMembers);
    if (total === 0) {
      await db.insert(appMembers).values({
        email: user.email,
        displayName: user.displayName,
        role: "admin",
        status: "active",
        lastSeenAt: new Date().toISOString(),
      }).onConflictDoNothing();
      [member] = await db.select().from(appMembers).where(eq(appMembers.email, user.email)).limit(1);
    }
  }

  if (!member || member.status !== "active") {
    throw new AdminAccessError(403, "This account is not authorized for the data console.");
  }

  const now = new Date().toISOString();
  await db.update(appMembers).set({
    displayName: user.displayName,
    lastSeenAt: now,
    updatedAt: now,
  }).where(eq(appMembers.email, user.email));

  return { email: user.email, displayName: user.displayName, role: member.role };
}

export async function getAdminOverview(actor: AdminActor) {
  const db = await getDb();
  const [
    [{ total: leagueCount }],
    [{ total: teamCount }],
    [{ total: fixtureCount }],
    [{ total: runCount }],
    [{ total: issueCount }],
    [{ total: pendingAliasCount }],
    [{ total: pendingFixtureCount }],
    [{ total: eligibleRunCount }],
    [{ total: failedRunCount }],
  ] = await Promise.all([
    db.select({ total: count() }).from(leagues),
    db.select({ total: count() }).from(teams),
    db.select({ total: count() }).from(fixtures),
    db.select({ total: count() }).from(ingestionRuns),
    db.select({ total: count() }).from(ingestionIssues),
    db.select({ total: count() }).from(teamAliases).where(eq(teamAliases.status, "review")),
    db.select({ total: count() }).from(fixtureMappings).where(eq(fixtureMappings.status, "review")),
    db.select({ total: count() }).from(ingestionRuns).where(eq(ingestionRuns.recommendationEligible, true)),
    db.select({ total: count() }).from(ingestionRuns).where(eq(ingestionRuns.status, "failed")),
  ]);
  const sources = await db.select({
    id: dataSources.id,
    name: dataSources.name,
    baseUrl: dataSources.baseUrl,
    acquisitionMethod: dataSources.acquisitionMethod,
    legalStatus: dataSources.legalStatus,
    isActive: dataSources.isActive,
    updatedAt: dataSources.updatedAt,
  }).from(dataSources).orderBy(desc(dataSources.updatedAt)).limit(20);
  const runs = await db.select({
    id: ingestionRuns.id,
    sourceId: ingestionRuns.sourceId,
    sourceName: dataSources.name,
    status: ingestionRuns.status,
    capturedAt: ingestionRuns.capturedAt,
    recordCount: ingestionRuns.recordCount,
    importFormat: ingestionRuns.importFormat,
    dataGrade: ingestionRuns.dataGrade,
    qualityScore: ingestionRuns.qualityScore,
    completenessScore: ingestionRuns.completenessScore,
    consistencyScore: ingestionRuns.consistencyScore,
    freshnessScore: ingestionRuns.freshnessScore,
    warningCount: ingestionRuns.warningCount,
    errorCount: ingestionRuns.errorCount,
    recommendationEligible: ingestionRuns.recommendationEligible,
    checksumSha256: ingestionRuns.checksumSha256,
    createdByEmail: ingestionRuns.createdByEmail,
    completedAt: ingestionRuns.completedAt,
  }).from(ingestionRuns)
    .leftJoin(dataSources, eq(ingestionRuns.sourceId, dataSources.id))
    .orderBy(desc(ingestionRuns.createdAt))
    .limit(12);
  const pendingAliases = await db.select({
    id: teamAliases.id,
    externalTeamKey: teamAliases.externalTeamKey,
    externalTeamName: teamAliases.externalTeamName,
    canonicalTeamName: teams.name,
    confidence: teamAliases.confidence,
    sourceName: dataSources.name,
  }).from(teamAliases)
    .innerJoin(teams, eq(teamAliases.teamId, teams.id))
    .innerJoin(dataSources, eq(teamAliases.sourceId, dataSources.id))
    .where(eq(teamAliases.status, "review"))
    .orderBy(desc(teamAliases.createdAt))
    .limit(12);
  const pendingFixtures = await db.select({
    id: fixtureMappings.id,
    externalFixtureKey: fixtureMappings.externalFixtureKey,
    kickoffAt: fixtureMappings.sourceKickoffAt,
    confidence: fixtureMappings.confidence,
    sourceName: dataSources.name,
  }).from(fixtureMappings)
    .innerJoin(dataSources, eq(fixtureMappings.sourceId, dataSources.id))
    .where(eq(fixtureMappings.status, "review"))
    .orderBy(desc(fixtureMappings.createdAt))
    .limit(12);
  const latestCompleted = runs.find((run) => run.status === "completed") ?? null;

  return {
    actor,
    counts: { leagues: leagueCount, teams: teamCount, fixtures: fixtureCount, runs: runCount },
    health: {
      latestGrade: latestCompleted?.dataGrade ?? null,
      latestQualityScore: latestCompleted?.qualityScore ?? null,
      latestCompletedAt: latestCompleted?.completedAt ?? null,
      issueCount,
      pendingAliasCount,
      pendingFixtureCount,
      eligibleRunCount,
      failedRunCount,
    },
    sources,
    runs,
    pendingAliases,
    pendingFixtures,
  };
}

export async function importFootballSnapshot(
  actor: AdminActor,
  envelope: AdminImportEnvelope,
  options: ImportOptions = {},
) {
  const db = await getDb();
  const bucket = await getBucket();
  const raw = JSON.stringify(envelope);
  const checksumSha256 = await sha256(raw);
  const sourceId = await buildSourceId(envelope.source.name);
  const runId = crypto.randomUUID();
  const capturedDate = new Date(envelope.capturedAt);
  const snapshotKey = [
    "raw",
    String(capturedDate.getUTCFullYear()),
    String(capturedDate.getUTCMonth() + 1).padStart(2, "0"),
    String(capturedDate.getUTCDate()).padStart(2, "0"),
    `${runId}.json`,
  ].join("/");
  const now = new Date().toISOString();

  await db.insert(dataSources).values({
    id: sourceId,
    name: envelope.source.name,
    baseUrl: envelope.source.baseUrl,
    acquisitionMethod: envelope.source.acquisitionMethod,
    legalStatus: envelope.source.legalStatus,
    isActive: true,
    createdByEmail: actor.email,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: dataSources.id,
    set: {
      baseUrl: envelope.source.baseUrl,
      acquisitionMethod: envelope.source.acquisitionMethod,
      legalStatus: envelope.source.legalStatus,
      isActive: true,
      updatedAt: now,
    },
  });

  await db.insert(ingestionRuns).values({
    id: runId,
    sourceId,
    status: "processing",
    capturedAt: envelope.capturedAt,
    snapshotKey,
    checksumSha256,
    importFormat: options.importFormat ?? "json",
    recordCount: 0,
    createdByEmail: actor.email,
  });

  try {
    await bucket.put(snapshotKey, raw, {
      httpMetadata: { contentType: "application/json; charset=utf-8" },
      customMetadata: {
        checksumSha256,
        sourceName: envelope.source.name.slice(0, 100),
        capturedAt: envelope.capturedAt,
      },
    });

    const payload = envelope.payload;
    await db.insert(leagues).values({
      id: payload.league.id,
      countryCode: payload.league.countryCode,
      name: payload.league.name,
      tier: payload.league.tier,
      coverageLevel: payload.league.coverageLevel,
      isActive: true,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: leagues.id,
      set: {
        countryCode: payload.league.countryCode,
        name: payload.league.name,
        tier: payload.league.tier,
        coverageLevel: payload.league.coverageLevel,
        isActive: true,
        updatedAt: now,
      },
    });

    if (payload.teams.length) {
      await db.insert(teams).values(payload.teams.map((team) => ({ ...team, updatedAt: now })))
        .onConflictDoUpdate({
          target: teams.id,
          set: {
            name: sql`excluded.name`,
            shortName: sql`excluded.short_name`,
            countryCode: sql`excluded.country_code`,
            updatedAt: now,
          },
        });
    }

    if (payload.fixtures.length) {
      await db.insert(fixtures).values(payload.fixtures.map((fixture) => ({
        ...fixture,
        leagueId: payload.league.id,
        season: payload.season,
        sourceId,
        ingestionRunId: runId,
        updatedAt: now,
      }))).onConflictDoUpdate({
        target: fixtures.id,
        set: {
          kickoffAt: sql`excluded.kickoff_at`,
          status: sql`excluded.status`,
          homeScore: sql`excluded.home_score`,
          awayScore: sql`excluded.away_score`,
          sourceId,
          ingestionRunId: runId,
          updatedAt: now,
        },
      });
    }

    if (payload.stats.length) {
      await db.insert(teamMatchStats).values(payload.stats.map((stat) => ({
        ...stat,
        ingestionRunId: runId,
        updatedAt: now,
      }))).onConflictDoUpdate({
        target: [teamMatchStats.fixtureId, teamMatchStats.teamId],
        set: {
          possession: sql`excluded.possession`,
          shots: sql`excluded.shots`,
          shotsOnTarget: sql`excluded.shots_on_target`,
          expectedGoals: sql`excluded.expected_goals`,
          dangerousAttacks: sql`excluded.dangerous_attacks`,
          penaltyAreaEntries: sql`excluded.penalty_area_entries`,
          ppda: sql`excluded.ppda`,
          bigChancesAllowed: sql`excluded.big_chances_allowed`,
          ingestionRunId: runId,
          updatedAt: now,
        },
      });
    }

    if (payload.odds.length) {
      await db.insert(oddsSnapshots).values(payload.odds.map((odd) => ({
        ...odd,
        id: `${odd.id}:${runId}`,
        ingestionRunId: runId,
      }))).onConflictDoNothing();
    }

    if (payload.lineups.length) {
      await db.insert(lineupSnapshots).values(payload.lineups.map((lineup) => ({
        id: `${lineup.id}:${runId}`,
        fixtureId: lineup.fixtureId,
        teamId: lineup.teamId,
        status: lineup.status,
        playersJson: JSON.stringify(lineup.players),
        unavailablePlayersJson: JSON.stringify(lineup.unavailablePlayers),
        capturedAt: lineup.capturedAt,
        ingestionRunId: runId,
      }))).onConflictDoNothing();
    }

    const importedRecords = recordCount(payload);
    const quality = evaluatePayloadQuality(payload, {
      capturedAt: envelope.capturedAt,
      externalIssues: options.externalIssues,
    });
    if (quality.issues.length) {
      await db.insert(ingestionIssues).values(quality.issues.map((item) => ({
        id: crypto.randomUUID(),
        ingestionRunId: runId,
        severity: item.severity,
        code: item.code,
        entityType: item.entityType,
        entityKey: item.entityKey,
        field: item.field,
        message: item.message,
        detailsJson: JSON.stringify(item.details ?? {}),
      })));
    }
    await db.update(ingestionRuns).set({
      status: "completed",
      recordCount: importedRecords,
      dataGrade: quality.grade,
      qualityScore: quality.qualityScore,
      completenessScore: quality.completenessScore,
      consistencyScore: quality.consistencyScore,
      freshnessScore: quality.freshnessScore,
      warningCount: quality.warningCount,
      errorCount: quality.errorCount,
      recommendationEligible: quality.recommendationEligible,
      completedAt: now,
    }).where(eq(ingestionRuns.id, runId));
    await db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      actorEmail: actor.email,
      action: "snapshot.imported",
      entityType: "ingestion_run",
      entityId: runId,
      detailsJson: JSON.stringify({ sourceId, snapshotKey, checksumSha256, importedRecords }),
    });

    return { runId, sourceId, snapshotKey, checksumSha256, recordCount: importedRecords, quality };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Import failed";
    await db.update(ingestionRuns).set({
      status: "failed",
      errorMessage: message,
      completedAt: new Date().toISOString(),
    }).where(eq(ingestionRuns.id, runId));
    throw error;
  }
}

export async function reviewDataMapping(
  actor: AdminActor,
  kind: "team_alias" | "fixture",
  id: string,
) {
  if (actor.role !== "admin") throw new AdminAccessError(403, "Only administrators can approve mappings.");
  if (!/^[a-z0-9-]{4,96}$/i.test(id)) throw new AdminAccessError(400, "A valid mapping id is required.");
  const db = await getDb();
  const now = new Date().toISOString();

  if (kind === "team_alias") {
    const [mapping] = await db.select({ id: teamAliases.id }).from(teamAliases).where(eq(teamAliases.id, id)).limit(1);
    if (!mapping) throw new AdminAccessError(404, "Team alias mapping not found.");
    await db.update(teamAliases).set({
      status: "matched",
      confidence: 1,
      reviewedByEmail: actor.email,
      reviewedAt: now,
      updatedAt: now,
    }).where(eq(teamAliases.id, id));
  } else if (kind === "fixture") {
    const [mapping] = await db.select({ id: fixtureMappings.id }).from(fixtureMappings).where(eq(fixtureMappings.id, id)).limit(1);
    if (!mapping) throw new AdminAccessError(404, "Fixture mapping not found.");
    await db.update(fixtureMappings).set({
      status: "matched",
      confidence: 1,
      reviewedByEmail: actor.email,
      reviewedAt: now,
      updatedAt: now,
    }).where(eq(fixtureMappings.id, id));
  } else {
    throw new AdminAccessError(400, "Unsupported mapping kind.");
  }

  await db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    actorEmail: actor.email,
    action: `${kind}.approved`,
    entityType: kind,
    entityId: id,
  });
  return { id, kind, status: "matched" as const };
}

export async function getRawSnapshot(actor: AdminActor, runId: string) {
  const db = await getDb();
  const [run] = await db.select({ snapshotKey: ingestionRuns.snapshotKey })
    .from(ingestionRuns)
    .where(eq(ingestionRuns.id, runId))
    .limit(1);
  if (!run) return null;
  const object = await (await getBucket()).get(run.snapshotKey);
  if (!object) return null;
  await db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    actorEmail: actor.email,
    action: "snapshot.downloaded",
    entityType: "ingestion_run",
    entityId: runId,
  });
  return object;
}

export function toAdminApiError(error: unknown) {
  if (error instanceof AdminAccessError) return { status: error.status, message: error.message };
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (message.includes("no such table")) {
    return { status: 503, message: "The data core migration has not been applied yet." };
  }
  if (message.includes("binding")) {
    return { status: 503, message: "The persistent storage bindings are not available." };
  }
  return { status: 500, message };
}

async function getBucket(): Promise<R2Bucket> {
  const { env } = await import("cloudflare:workers");
  const bucket = (env as unknown as { BUCKET?: R2Bucket }).BUCKET;
  if (!bucket) throw new Error("Cloudflare R2 binding `BUCKET` is unavailable.");
  return bucket;
}

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function slugify(value: string) {
  const slug = value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48);
  return slug || "source";
}

export async function buildSourceId(name: string) {
  const sourceNameChecksum = await sha256(name.trim().toLowerCase());
  return `src_${slugify(name)}_${sourceNameChecksum.slice(0, 8)}`;
}
