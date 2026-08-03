import { asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLogs,
  fixtures,
  predictionEvents,
  predictionSettlements,
  predictionThreads,
  predictionVersions,
} from "@/db/schema";
import type { AdminActor } from "@/lib/admin-data";
import { canonicalPredictionJson } from "@/lib/prediction-lifecycle";
import {
  actualOutcomeForFixture,
  settlementStatusFor,
} from "@/lib/user-performance";

export async function settleFinishedPredictions(actor: AdminActor) {
  const db = await getDb();
  const finalizedEvents = await db.select().from(predictionEvents)
    .where(eq(predictionEvents.eventType, "finalized"))
    .orderBy(asc(predictionEvents.threadId), asc(predictionEvents.sequence));
  if (!finalizedEvents.length) {
    return { processed: 0, alreadySettled: 0, pending: 0, excludedResearch: 0 };
  }

  const versionIds = finalizedEvents.flatMap((event) => event.versionId ? [event.versionId] : []);
  const threadIds = [...new Set(finalizedEvents.map((event) => event.threadId))];
  const [versionRows, threadRows, existingRows, allEvents] = await Promise.all([
    versionIds.length
      ? db.select().from(predictionVersions).where(inArray(predictionVersions.id, versionIds))
      : Promise.resolve([]),
    db.select().from(predictionThreads).where(inArray(predictionThreads.id, threadIds)),
    versionIds.length
      ? db.select({ finalVersionId: predictionSettlements.finalVersionId })
        .from(predictionSettlements)
        .where(inArray(predictionSettlements.finalVersionId, versionIds))
      : Promise.resolve([]),
    db.select().from(predictionEvents)
      .where(inArray(predictionEvents.threadId, threadIds))
      .orderBy(asc(predictionEvents.threadId), asc(predictionEvents.sequence)),
  ]);
  const fixtureIds = [...new Set(threadRows.map((thread) => thread.fixtureId))];
  const fixtureRows = fixtureIds.length
    ? await db.select().from(fixtures).where(inArray(fixtures.id, fixtureIds))
    : [];
  const versionById = new Map(versionRows.map((version) => [version.id, version]));
  const threadById = new Map(threadRows.map((thread) => [thread.id, thread]));
  const fixtureById = new Map(fixtureRows.map((fixture) => [fixture.id, fixture]));
  const settledVersionIds = new Set(existingRows.map((row) => row.finalVersionId));
  const eventsByThread = new Map<string, typeof allEvents>();
  for (const event of allEvents) {
    eventsByThread.set(event.threadId, [...(eventsByThread.get(event.threadId) ?? []), event]);
  }

  let processed = 0;
  let alreadySettled = 0;
  let pending = 0;
  let excludedResearch = 0;
  const nowIso = new Date().toISOString();

  for (const publication of finalizedEvents) {
    if (!publication.versionId) continue;
    if (settledVersionIds.has(publication.versionId)) {
      alreadySettled += 1;
      continue;
    }
    const version = versionById.get(publication.versionId);
    const thread = threadById.get(publication.threadId);
    const fixture = thread ? fixtureById.get(thread.fixtureId) : undefined;
    if (!version || !thread || !fixture) {
      pending += 1;
      continue;
    }
    if (version.researchOnly || !version.recommendationEligible || !version.recommendationOutcome) {
      excludedResearch += 1;
      continue;
    }
    const actualOutcome = actualOutcomeForFixture(fixture);
    if (!actualOutcome) {
      pending += 1;
      continue;
    }
    const timeline = eventsByThread.get(thread.id) ?? [];
    const nextFinal = timeline.find((event) => (
      event.sequence > publication.sequence && event.eventType === "finalized"
    ));
    const withdrawal = timeline.find((event) => (
      event.sequence > publication.sequence
      && event.eventType === "withdrawn"
      && (!nextFinal || event.sequence < nextFinal.sequence)
    ));
    const withdrawnBeforeKickoff = Boolean(
      withdrawal && Date.parse(withdrawal.occurredAt) < Date.parse(fixture.kickoffAt),
    );
    const settlementStatus = settlementStatusFor({
      predictedOutcome: version.recommendationOutcome,
      actualOutcome,
      withdrawnBeforeKickoff,
    });
    await db.insert(predictionSettlements).values({
      id: crypto.randomUUID(),
      threadId: thread.id,
      finalVersionId: version.id,
      publicationEventId: publication.id,
      fixtureId: fixture.id,
      predictedOutcome: version.recommendationOutcome,
      actualOutcome,
      settlementStatus,
      homeScore: fixture.homeScore,
      awayScore: fixture.awayScore,
      withdrawalEventId: withdrawal?.id ?? null,
      settledAt: nowIso,
    }).onConflictDoNothing();
    settledVersionIds.add(version.id);
    processed += 1;
  }

  if (processed > 0) {
    await db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      actorEmail: actor.email,
      action: "prediction.settlements_processed",
      entityType: "prediction_settlement_batch",
      entityId: crypto.randomUUID(),
      detailsJson: canonicalPredictionJson({ processed, alreadySettled, pending, excludedResearch }),
    });
  }
  return { processed, alreadySettled, pending, excludedResearch };
}
