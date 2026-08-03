import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLogs,
  fixtures,
  oddsSnapshots,
  predictionThreads,
  predictionValueAssessments,
  predictionVersions,
  teams,
} from "@/db/schema";
import type { AdminActor } from "@/lib/admin-data";
import {
  canonicalPredictionJson,
  predictionIdentity,
} from "@/lib/prediction-lifecycle";
import {
  VALUE_ENGINE_POLICY,
  VALUE_ENGINE_SCHEMA_VERSION,
  evaluateValueOpportunity,
  type ValueAssessment,
} from "@/lib/value-engine";

export async function ensureValueAssessmentForVersion(actor: AdminActor, predictionVersionId: string) {
  const db = await getDb();
  const [existing] = await db.select().from(predictionValueAssessments)
    .where(eq(predictionValueAssessments.predictionVersionId, predictionVersionId)).limit(1);
  if (existing) return { reused: true, assessment: toPublicValueAssessment(existing) };

  const [version] = await db.select().from(predictionVersions)
    .where(eq(predictionVersions.id, predictionVersionId)).limit(1);
  if (!version) throw new Error("The prediction version for value assessment was not found.");
  const [[thread], [fixture], quotes] = await Promise.all([
    db.select().from(predictionThreads).where(eq(predictionThreads.id, version.threadId)).limit(1),
    db.select().from(fixtures).where(eq(fixtures.id, version.fixtureId)).limit(1),
    db.select({
      id: oddsSnapshots.id,
      bookmaker: oddsSnapshots.bookmaker,
      market: oddsSnapshots.market,
      selection: oddsSnapshots.selection,
      decimalOdds: oddsSnapshots.decimalOdds,
      capturedAt: oddsSnapshots.capturedAt,
    }).from(oddsSnapshots).where(eq(oddsSnapshots.fixtureId, version.fixtureId)),
  ]);
  if (!thread || !fixture) throw new Error("The prediction value context is incomplete.");
  const result = evaluateValueOpportunity({
    fixtureId: fixture.id,
    asOf: version.predictionAt,
    kickoffAt: fixture.kickoffAt,
    modelProbabilities: {
      home: version.probabilityHome,
      draw: version.probabilityDraw,
      away: version.probabilityAway,
    },
    predictedOutcome: version.predictedOutcome,
    quotes,
  });
  const assessmentFingerprint = await predictionIdentity({
    predictionVersionFingerprint: version.versionFingerprint,
    valueEngineSchemaVersion: VALUE_ENGINE_SCHEMA_VERSION,
    result,
  });
  const id = crypto.randomUUID();
  await db.batch([
    db.insert(predictionValueAssessments).values(toAssessmentInsert({
      id,
      threadId: thread.id,
      predictionVersionId: version.id,
      fixtureId: fixture.id,
      assessmentFingerprint,
      result,
    })).onConflictDoNothing(),
    db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      actorEmail: actor.email,
      action: "prediction.value_assessed",
      entityType: "prediction_value_assessment",
      entityId: id,
      detailsJson: canonicalPredictionJson({
        predictionVersionId: version.id,
        status: result.status,
        recommendationEligible: result.recommendationEligible,
        assessmentFingerprint,
      }),
    }),
  ]);
  const [inserted] = await db.select().from(predictionValueAssessments)
    .where(eq(predictionValueAssessments.predictionVersionId, version.id)).limit(1);
  if (!inserted) throw new Error("The value assessment could not be persisted.");
  return { reused: false, assessment: toPublicValueAssessment(inserted) };
}

export async function refreshValueAssessments(actor: AdminActor, limit = 200) {
  const db = await getDb();
  const versions = await db.select({ id: predictionVersions.id }).from(predictionVersions)
    .orderBy(desc(predictionVersions.predictionAt)).limit(Math.max(1, Math.min(500, limit)));
  if (!versions.length) return { processed: 0, reused: 0, failed: 0 };
  const existing = await db.select({ predictionVersionId: predictionValueAssessments.predictionVersionId })
    .from(predictionValueAssessments)
    .where(inArray(predictionValueAssessments.predictionVersionId, versions.map((version) => version.id)));
  const existingIds = new Set(existing.map((row) => row.predictionVersionId));
  let processed = 0;
  let reused = 0;
  let failed = 0;
  for (const version of versions) {
    if (existingIds.has(version.id)) {
      reused += 1;
      continue;
    }
    try {
      await ensureValueAssessmentForVersion(actor, version.id);
      processed += 1;
    } catch {
      failed += 1;
    }
  }
  return { processed, reused, failed };
}

export async function getValueOpsOverview(actor: AdminActor) {
  const db = await getDb();
  const [assessmentRows, versionRows] = await Promise.all([
    db.select().from(predictionValueAssessments)
      .orderBy(desc(predictionValueAssessments.assessedAt)).limit(100),
    db.select({ id: predictionVersions.id }).from(predictionVersions)
      .orderBy(desc(predictionVersions.predictionAt)).limit(300),
  ]);
  const versionIds = assessmentRows.map((row) => row.predictionVersionId);
  const threadIds = [...new Set(assessmentRows.map((row) => row.threadId))];
  const fixtureIds = [...new Set(assessmentRows.map((row) => row.fixtureId))];
  const [versions, threads, fixtureRows] = await Promise.all([
    versionIds.length
      ? db.select().from(predictionVersions).where(inArray(predictionVersions.id, versionIds))
      : Promise.resolve([]),
    threadIds.length
      ? db.select().from(predictionThreads).where(inArray(predictionThreads.id, threadIds))
      : Promise.resolve([]),
    fixtureIds.length
      ? db.select().from(fixtures).where(inArray(fixtures.id, fixtureIds))
      : Promise.resolve([]),
  ]);
  const teamIds = [...new Set(fixtureRows.flatMap((fixture) => [fixture.homeTeamId, fixture.awayTeamId]))];
  const teamRows = teamIds.length
    ? await db.select({ id: teams.id, name: teams.name }).from(teams).where(inArray(teams.id, teamIds))
    : [];
  const versionById = new Map(versions.map((row) => [row.id, row]));
  const threadById = new Map(threads.map((row) => [row.id, row]));
  const fixtureById = new Map(fixtureRows.map((row) => [row.id, row]));
  const teamById = new Map(teamRows.map((row) => [row.id, row.name]));
  const assessedIds = new Set(assessmentRows.map((row) => row.predictionVersionId));
  const counts = {
    assessed: assessmentRows.length,
    eligible: assessmentRows.filter((row) => row.recommendationEligible).length,
    value: assessmentRows.filter((row) => row.status === "value").length,
    lowOddsValue: assessmentRows.filter((row) => row.status === "low_odds_value").length,
    anomaly: assessmentRows.filter((row) => row.status === "market_anomaly").length,
    stale: assessmentRows.filter((row) => row.status === "stale_market").length,
    uncoveredRecent: versionRows.filter((row) => !assessedIds.has(row.id)).length,
  };

  return {
    actor: { email: actor.email, displayName: actor.displayName, role: actor.role },
    generatedAt: new Date().toISOString(),
    counts,
    policy: VALUE_ENGINE_POLICY,
    engineSchemaVersion: VALUE_ENGINE_SCHEMA_VERSION,
    assessments: assessmentRows.map((row) => {
      const version = versionById.get(row.predictionVersionId);
      const thread = threadById.get(row.threadId);
      const fixture = fixtureById.get(row.fixtureId);
      return {
        ...toPublicValueAssessment(row),
        versionNumber: version?.versionNumber ?? null,
        versionFingerprint: version?.versionFingerprint ?? null,
        threadStatus: thread?.status ?? null,
        leagueLabel: thread?.leagueLabel ?? "Bilinmeyen lig",
        kickoffAt: fixture?.kickoffAt ?? null,
        homeTeamName: fixture ? teamById.get(fixture.homeTeamId) ?? fixture.homeTeamId : "Bilinmeyen ev sahibi",
        awayTeamName: fixture ? teamById.get(fixture.awayTeamId) ?? fixture.awayTeamId : "Bilinmeyen deplasman",
      };
    }),
  };
}

function toAssessmentInsert(input: {
  id: string;
  threadId: string;
  predictionVersionId: string;
  fixtureId: string;
  assessmentFingerprint: string;
  result: ValueAssessment;
}): typeof predictionValueAssessments.$inferInsert {
  const result = input.result;
  return {
    id: input.id,
    threadId: input.threadId,
    predictionVersionId: input.predictionVersionId,
    fixtureId: input.fixtureId,
    engineSchemaVersion: result.schemaVersion,
    market: "1X2",
    predictedOutcome: result.predictedOutcome,
    status: result.status,
    recommendationEligible: result.recommendationEligible,
    modelProbability: result.modelProbability,
    fairMarketProbability: result.fairMarketProbability,
    fairProbabilityHome: result.fairMarketProbabilities?.home ?? null,
    fairProbabilityDraw: result.fairMarketProbabilities?.draw ?? null,
    fairProbabilityAway: result.fairMarketProbabilities?.away ?? null,
    edge: result.edge,
    expectedValue: result.expectedValue,
    bestDecimalOdds: result.bestDecimalOdds,
    bestBookmaker: result.bestBookmaker,
    bookmakerCount: result.bookmakerCount,
    latestCapturedAt: result.latestCapturedAt,
    snapshotAgeMinutes: result.snapshotAgeMinutes,
    averageOverround: result.averageOverround,
    fairProbabilityDispersion: result.fairProbabilityDispersion,
    maximumRelativeOddsMove: result.maximumRelativeOddsMove,
    maximumFairProbabilityMove: result.maximumFairProbabilityMove,
    flagCodesJson: canonicalPredictionJson(result.flags),
    booksJson: canonicalPredictionJson(result.books),
    evidenceJson: canonicalPredictionJson(result),
    assessmentFingerprint: input.assessmentFingerprint,
    assessedAt: result.assessedAt,
  };
}

export function toPublicValueAssessment(row: typeof predictionValueAssessments.$inferSelect) {
  return {
    id: row.id,
    predictionVersionId: row.predictionVersionId,
    fixtureId: row.fixtureId,
    schemaVersion: row.engineSchemaVersion,
    market: row.market,
    predictedOutcome: row.predictedOutcome,
    status: row.status,
    recommendationEligible: row.recommendationEligible,
    modelProbability: row.modelProbability,
    fairMarketProbability: row.fairMarketProbability,
    fairMarketProbabilities: row.fairProbabilityHome === null
      || row.fairProbabilityDraw === null
      || row.fairProbabilityAway === null
      ? null
      : { home: row.fairProbabilityHome, draw: row.fairProbabilityDraw, away: row.fairProbabilityAway },
    edge: row.edge,
    expectedValue: row.expectedValue,
    bestDecimalOdds: row.bestDecimalOdds,
    bestBookmaker: row.bestBookmaker,
    bookmakerCount: row.bookmakerCount,
    latestCapturedAt: row.latestCapturedAt,
    snapshotAgeMinutes: row.snapshotAgeMinutes,
    averageOverround: row.averageOverround,
    fairProbabilityDispersion: row.fairProbabilityDispersion,
    maximumRelativeOddsMove: row.maximumRelativeOddsMove,
    maximumFairProbabilityMove: row.maximumFairProbabilityMove,
    flags: parseJson<string[]>(row.flagCodesJson, []),
    books: parseJson<ValueAssessment["books"]>(row.booksJson, []),
    assessmentFingerprint: row.assessmentFingerprint,
    assessedAt: row.assessedAt,
  };
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export type ValueOpsOverview = Awaited<ReturnType<typeof getValueOpsOverview>>;
