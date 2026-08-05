import { count, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  dataSources,
  fixtures,
  ingestionRuns,
  leagues,
  modelDefinitions,
  modelVersions,
  predictionLineageRecords,
  predictionThreads,
  predictionVersions,
  teams,
} from "@/db/schema";
import type { AdminActor } from "@/lib/admin-data";
import {
  inspectPredictionLineage,
  parsePredictionLineageManifest,
  type LineageModelEvidence,
  type LineageRunEvidence,
} from "@/lib/data-lineage";
import { ModelLabValidationError } from "@/lib/model-lab";

const RECENT_VERSION_LIMIT = 40;
const RAW_OBJECT_VERIFICATION_LIMIT = 50;

export async function getDataLineageOverview(actor: AdminActor, versionId?: string | null) {
  const requestedVersionId = normalizeVersionId(versionId);
  const db = await getDb();
  const [recentVersions, versionCountRows, lineageCountRows] = await Promise.all([
    db.select().from(predictionVersions)
      .orderBy(desc(predictionVersions.createdAt), desc(predictionVersions.id))
      .limit(RECENT_VERSION_LIMIT),
    db.select({ total: count() }).from(predictionVersions),
    db.select({ total: count() }).from(predictionLineageRecords),
  ]);

  const requestedVersion = requestedVersionId
    ? (await db.select().from(predictionVersions)
      .where(eq(predictionVersions.id, requestedVersionId)).limit(1))[0] ?? null
    : null;
  if (requestedVersionId && !requestedVersion) {
    throw new ModelLabValidationError("The requested prediction version could not be found.");
  }
  const selectedVersion = requestedVersion ?? recentVersions[0] ?? null;
  const versionIds = recentVersions.map((row) => row.id);
  const lineageRows = versionIds.length
    ? await db.select().from(predictionLineageRecords)
      .where(inArray(predictionLineageRecords.predictionVersionId, versionIds))
    : [];
  const lineageByVersion = new Map(lineageRows.map((row) => [row.predictionVersionId, row]));

  const fixtureIds = [...new Set([
    ...recentVersions.map((row) => row.fixtureId),
    ...(selectedVersion ? [selectedVersion.fixtureId] : []),
  ])];
  const fixtureRows = fixtureIds.length
    ? await db.select().from(fixtures).where(inArray(fixtures.id, fixtureIds))
    : [];
  const leagueIds = [...new Set(fixtureRows.map((row) => row.leagueId))];
  const teamIds = [...new Set(fixtureRows.flatMap((row) => [row.homeTeamId, row.awayTeamId]))];
  const [leagueRows, teamRows] = await Promise.all([
    leagueIds.length
      ? db.select({ id: leagues.id, name: leagues.name }).from(leagues).where(inArray(leagues.id, leagueIds))
      : Promise.resolve([]),
    teamIds.length
      ? db.select({ id: teams.id, name: teams.name }).from(teams).where(inArray(teams.id, teamIds))
      : Promise.resolve([]),
  ]);
  const fixtureById = new Map(fixtureRows.map((row) => [row.id, row]));
  const leagueById = new Map(leagueRows.map((row) => [row.id, row.name]));
  const teamById = new Map(teamRows.map((row) => [row.id, row.name]));

  const selectedLineage = selectedVersion
    ? lineageByVersion.get(selectedVersion.id)
      ?? (await db.select().from(predictionLineageRecords)
        .where(eq(predictionLineageRecords.predictionVersionId, selectedVersion.id)).limit(1))[0]
      ?? null
    : null;
  const parsedManifest = selectedLineage
    ? parsePredictionLineageManifest(selectedLineage.manifestJson)
    : null;
  const manifestMalformed = Boolean(selectedLineage && !parsedManifest);
  const runIds = parsedManifest
    ? [...new Set(parsedManifest.sourceReferences.flatMap((reference) => (
      reference.ingestionRunId ? [reference.ingestionRunId] : []
    )))]
    : [];
  const runRows = runIds.length
    ? await db.select({
      id: ingestionRuns.id,
      sourceName: dataSources.name,
      legalStatus: dataSources.legalStatus,
      status: ingestionRuns.status,
      capturedAt: ingestionRuns.capturedAt,
      snapshotKey: ingestionRuns.snapshotKey,
      checksumSha256: ingestionRuns.checksumSha256,
    }).from(ingestionRuns)
      .innerJoin(dataSources, eq(ingestionRuns.sourceId, dataSources.id))
      .where(inArray(ingestionRuns.id, runIds))
    : [];
  const rawObjectState = await verifyRawObjects(runRows.map((row) => ({
    id: row.id,
    snapshotKey: row.snapshotKey,
  })));
  const runs: LineageRunEvidence[] = runRows.map((row) => ({
    ...row,
    rawObjectExists: rawObjectState.get(row.id) ?? null,
  }));
  const model = parsedManifest?.modelVersionId
    ? await loadModelEvidence(parsedManifest.modelVersionId)
    : null;
  const publish = selectedVersion
    ? await loadPublishEvidence(selectedVersion.threadId, selectedVersion.versionNumber)
    : null;
  const graph = inspectPredictionLineage({
    manifest: parsedManifest,
    manifestMalformed,
    runs,
    model,
    publish,
  });
  const totalVersions = Number(versionCountRows[0]?.total ?? 0);
  const totalLineageRecords = Number(lineageCountRows[0]?.total ?? 0);

  return {
    actor: { email: actor.email, displayName: actor.displayName, role: actor.role },
    generatedAt: new Date().toISOString(),
    counts: {
      predictionVersions: totalVersions,
      lineageRecords: totalLineageRecords,
      missingRecords: Math.max(0, totalVersions - totalLineageRecords),
      coveragePercent: totalVersions ? Math.round((totalLineageRecords / totalVersions) * 10_000) / 100 : 100,
    },
    versions: recentVersions.map((version) => {
      const fixture = fixtureById.get(version.fixtureId);
      const lineage = lineageByVersion.get(version.id) ?? null;
      const manifest = lineage ? parsePredictionLineageManifest(lineage.manifestJson) : null;
      return {
        id: version.id,
        threadId: version.threadId,
        fixtureId: version.fixtureId,
        versionNumber: version.versionNumber,
        predictionAt: version.predictionAt,
        createdAt: version.createdAt,
        leagueLabel: fixture ? leagueById.get(fixture.leagueId) ?? fixture.leagueId : "Bilinmeyen lig",
        homeTeamName: fixture ? teamById.get(fixture.homeTeamId) ?? fixture.homeTeamId : "Bilinmeyen ev sahibi",
        awayTeamName: fixture ? teamById.get(fixture.awayTeamId) ?? fixture.awayTeamId : "Bilinmeyen deplasman",
        hasManifest: Boolean(lineage),
        manifestValid: Boolean(manifest),
        structuralBlockerCount: manifest?.blockerCodes.length ?? (lineage ? 1 : 1),
      };
    }),
    selected: selectedVersion ? {
      version: {
        id: selectedVersion.id,
        threadId: selectedVersion.threadId,
        fixtureId: selectedVersion.fixtureId,
        versionNumber: selectedVersion.versionNumber,
        predictionAt: selectedVersion.predictionAt,
        featureCutoffAt: selectedVersion.featureCutoffAt,
        featureFingerprint: selectedVersion.featureFingerprint,
        modelCode: selectedVersion.modelCode,
        modelVersionId: selectedVersion.modelVersionId,
      },
      record: selectedLineage ? {
        id: selectedLineage.id,
        schemaVersion: selectedLineage.schemaVersion,
        manifestChecksumSha256: selectedLineage.manifestChecksumSha256,
        createdAt: selectedLineage.createdAt,
      } : null,
      manifest: parsedManifest,
      runs,
      model,
      publish,
      graph,
    } : null,
    policy: {
      recentVersionLimit: RECENT_VERSION_LIMIT,
      rawObjectVerificationLimit: RAW_OBJECT_VERIFICATION_LIMIT,
      missingLinksFailClosed: true,
      rawPayloadExposed: false,
      researchOnly: true,
      recommendationEligible: false,
    },
  };
}

async function loadModelEvidence(modelVersionId: string): Promise<LineageModelEvidence> {
  const db = await getDb();
  const [row] = await db.select({
    id: modelVersions.id,
    versionLabel: modelVersions.versionLabel,
    status: modelVersions.status,
    modelCode: modelDefinitions.code,
    modelName: modelDefinitions.displayName,
  }).from(modelVersions)
    .innerJoin(modelDefinitions, eq(modelVersions.modelDefinitionId, modelDefinitions.id))
    .where(eq(modelVersions.id, modelVersionId))
    .limit(1);
  return row ?? null;
}

async function loadPublishEvidence(threadId: string, versionNumber: number) {
  const db = await getDb();
  const [thread] = await db.select().from(predictionThreads)
    .where(eq(predictionThreads.id, threadId)).limit(1);
  return thread ? {
    threadId: thread.id,
    threadStatus: thread.status,
    versionNumber,
    eventCount: thread.eventCount,
    researchOnly: thread.researchOnly,
    recommendationEligible: thread.recommendationEligible,
  } : null;
}

async function verifyRawObjects(rows: Array<{ id: string; snapshotKey: string | null }>) {
  const result = new Map<string, boolean | null>();
  for (const row of rows) result.set(row.id, null);
  if (!rows.length) return result;
  try {
    const { env } = await import("cloudflare:workers");
    const bucket = (env as unknown as { BUCKET?: R2Bucket }).BUCKET;
    if (!bucket) return result;
    await Promise.all(rows.slice(0, RAW_OBJECT_VERIFICATION_LIMIT).map(async (row) => {
      if (!row.snapshotKey) return;
      try {
        result.set(row.id, Boolean(await bucket.head(row.snapshotKey)));
      } catch {
        result.set(row.id, null);
      }
    }));
    return result;
  } catch {
    return result;
  }
}

function normalizeVersionId(value: string | null | undefined) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !value.trim() || value.length > 128) {
    throw new ModelLabValidationError("The lineage version id is invalid.");
  }
  return value.trim();
}

export type DataLineageOverview = Awaited<ReturnType<typeof getDataLineageOverview>>;
