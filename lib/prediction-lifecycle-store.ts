import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  lte,
} from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLogs,
  fixtureContextSnapshots,
  fixtures,
  leagues,
  lineupSnapshots,
  modelDefinitions,
  modelVersions,
  oddsSnapshots,
  predictionEvents,
  predictionLineageRecords,
  predictionThreads,
  predictionVersions,
  releaseGates,
  teamMatchStats,
  teams,
} from "@/db/schema";
import type { AdminActor } from "@/lib/admin-data";
import { ModelLabValidationError, type ProbabilityTriple } from "@/lib/model-lab";
import {
  FINALIZATION_MINIMUM_DATA_COMPLETENESS,
  MATERIAL_PROBABILITY_SHIFT,
  PREDICTION_LIFECYCLE_SCHEMA_VERSION,
  assessMaterialChange,
  canonicalPredictionJson,
  choosePredictionTrigger,
  evaluateFinalizationGate,
  predictionIdentity,
  topOutcome,
  transitionPredictionStatus,
  type LineupState,
  type PredictionStatus,
  type VersionSnapshot,
} from "@/lib/prediction-lifecycle";
import {
  UPCOMING_FORECAST_BUILDER_VERSION,
  buildUpcomingPointInTimeForecast,
} from "@/lib/point-in-time-dataset";
import { ensureValueAssessmentForVersion } from "@/lib/value-assessment-store";
import {
  CONTEXT_ENGINE_SCHEMA_VERSION,
  evaluateFixtureContext,
  type FixtureContextAssessment,
  type MatchContextInput,
  type TeamContextInput,
} from "@/lib/context-engine";
import { enqueuePredictionNotificationEvent } from "@/lib/notification-store";
import {
  buildPredictionLineageManifest,
  canonicalLineageJson,
  type LineageSourceReference,
} from "@/lib/data-lineage";

const INITIAL_WINDOW_HOURS = 72;
const MINIMUM_TIME_TO_KICKOFF_MINUTES = 30;
const RESULT_AVAILABILITY_HOURS = 4;
const MINIMUM_HISTORY_MATCHES = 5;

export type PredictionTransitionAction = "finalize" | "withdraw" | "reopen" | "expire";

export async function getPredictionOpsOverview(actor?: AdminActor) {
  const db = await getDb();
  const now = new Date();
  const nowIso = now.toISOString();
  const minimumKickoffIso = new Date(
    now.getTime() + MINIMUM_TIME_TO_KICKOFF_MINUTES * 60_000,
  ).toISOString();
  const windowEndIso = new Date(now.getTime() + INITIAL_WINDOW_HOURS * 3_600_000).toISOString();
  const [statusRows, threadRows, candidateRows] = await Promise.all([
    db.select({ status: predictionThreads.status, total: count() })
      .from(predictionThreads)
      .groupBy(predictionThreads.status),
    db.select().from(predictionThreads).orderBy(desc(predictionThreads.updatedAt)).limit(30),
    db.select({
      id: fixtures.id,
      leagueId: fixtures.leagueId,
      leagueLabel: leagues.name,
      kickoffAt: fixtures.kickoffAt,
      homeTeamId: fixtures.homeTeamId,
      awayTeamId: fixtures.awayTeamId,
      status: fixtures.status,
    }).from(fixtures)
      .innerJoin(leagues, eq(fixtures.leagueId, leagues.id))
      .where(and(
        eq(fixtures.status, "scheduled"),
        gt(fixtures.kickoffAt, minimumKickoffIso),
        lte(fixtures.kickoffAt, windowEndIso),
      ))
      .orderBy(asc(fixtures.kickoffAt))
      .limit(100),
  ]);

  const fixtureIds = [...new Set([
    ...threadRows.map((row) => row.fixtureId),
    ...candidateRows.map((row) => row.id),
  ])];
  const fixtureRows = fixtureIds.length
    ? await db.select().from(fixtures).where(inArray(fixtures.id, fixtureIds))
    : [];
  const teamIds = [...new Set(fixtureRows.flatMap((row) => [row.homeTeamId, row.awayTeamId]))];
  const teamRows = teamIds.length
    ? await db.select({ id: teams.id, name: teams.name, shortName: teams.shortName })
      .from(teams).where(inArray(teams.id, teamIds))
    : [];
  const currentVersionIds = threadRows.flatMap((row) => row.currentVersionId ? [row.currentVersionId] : []);
  const currentVersions = currentVersionIds.length
    ? await db.select().from(predictionVersions).where(inArray(predictionVersions.id, currentVersionIds))
    : [];
  const threadIds = threadRows.map((row) => row.id);
  const eventRows = threadIds.length
    ? await db.select().from(predictionEvents)
      .where(inArray(predictionEvents.threadId, threadIds))
      .orderBy(desc(predictionEvents.occurredAt), desc(predictionEvents.sequence))
      .limit(180)
    : [];
  const candidateLineups = candidateRows.length
    ? await db.select().from(lineupSnapshots)
      .where(and(
        inArray(lineupSnapshots.fixtureId, candidateRows.map((row) => row.id)),
        lte(lineupSnapshots.capturedAt, nowIso),
      ))
      .orderBy(desc(lineupSnapshots.capturedAt), desc(lineupSnapshots.id))
    : [];
  const candidateThreads = candidateRows.length
    ? await db.select({ id: predictionThreads.id, fixtureId: predictionThreads.fixtureId })
      .from(predictionThreads)
      .where(inArray(predictionThreads.fixtureId, candidateRows.map((row) => row.id)))
    : [];

  const fixtureById = new Map(fixtureRows.map((row) => [row.id, row]));
  const teamById = new Map(teamRows.map((row) => [row.id, row]));
  const versionById = new Map(currentVersions.map((row) => [row.id, row]));
  const eventsByThread = groupEvents(eventRows);
  const threadByFixture = new Map(candidateThreads.map((row) => [row.fixtureId, row]));
  const counts = { total: 0, watchlist: 0, final: 0, withdrawn: 0, expired: 0 };
  for (const row of statusRows) {
    const value = Number(row.total);
    counts.total += value;
    counts[row.status] = value;
  }

  return {
    actor: actor ? { email: actor.email, displayName: actor.displayName, role: actor.role } : null,
    generatedAt: nowIso,
    counts,
    candidates: candidateRows.map((row) => {
      const lineup = resolveLineupProjection(
        candidateLineups.filter((snapshot) => snapshot.fixtureId === row.id),
        row.homeTeamId,
        row.awayTeamId,
      );
      return {
        ...row,
        homeTeamName: teamById.get(row.homeTeamId)?.name ?? row.homeTeamId,
        awayTeamName: teamById.get(row.awayTeamId)?.name ?? row.awayTeamId,
        lineupState: lineup.state,
        existingThreadId: threadByFixture.get(row.id)?.id ?? null,
      };
    }),
    threads: threadRows.map((thread) => {
      const fixture = fixtureById.get(thread.fixtureId);
      const version = thread.currentVersionId ? versionById.get(thread.currentVersionId) : undefined;
      return {
        ...thread,
        kickoffAt: fixture?.kickoffAt ?? null,
        fixtureStatus: fixture?.status ?? null,
        homeTeamName: fixture ? teamById.get(fixture.homeTeamId)?.name ?? fixture.homeTeamId : "Bilinmeyen ev sahibi",
        awayTeamName: fixture ? teamById.get(fixture.awayTeamId)?.name ?? fixture.awayTeamId : "Bilinmeyen deplasman",
        currentVersion: version ? toVersionSummary(version) : null,
        events: (eventsByThread.get(thread.id) ?? []).slice(0, 12).map(toEventSummary),
      };
    }),
    policy: {
      lifecycleSchemaVersion: PREDICTION_LIFECYCLE_SCHEMA_VERSION,
      forecastBuilderVersion: UPCOMING_FORECAST_BUILDER_VERSION,
      initialWindowHours: INITIAL_WINDOW_HOURS,
      minimumTimeToKickoffMinutes: MINIMUM_TIME_TO_KICKOFF_MINUTES,
      minimumHistoryMatches: MINIMUM_HISTORY_MATCHES,
      minimumFinalizationDataCompleteness: FINALIZATION_MINIMUM_DATA_COMPLETENESS,
      materialProbabilityShift: MATERIAL_PROBABILITY_SHIFT,
      currentStage: "research_only" as const,
      notificationChannelsPlanned: ["web_in_app", "browser_push", "telegram"] as const,
      notificationDeliveryStatus: "active_cp14" as const,
    },
  };
}

export async function createPredictionVersion(actor: AdminActor, fixtureId: string) {
  if (typeof fixtureId !== "string" || !fixtureId.trim()) {
    throw new ModelLabValidationError("A fixture id is required for prediction versioning.");
  }
  const db = await getDb();
  const now = new Date();
  const nowIso = now.toISOString();
  const [target] = await db.select({
    id: fixtures.id,
    leagueId: fixtures.leagueId,
    leagueLabel: leagues.name,
    kickoffAt: fixtures.kickoffAt,
    homeTeamId: fixtures.homeTeamId,
    awayTeamId: fixtures.awayTeamId,
    status: fixtures.status,
    ingestionRunId: fixtures.ingestionRunId,
  }).from(fixtures)
    .innerJoin(leagues, eq(fixtures.leagueId, leagues.id))
    .where(eq(fixtures.id, fixtureId.trim()))
    .limit(1);
  if (!target) throw new ModelLabValidationError("The selected fixture could not be found.");
  const kickoffMs = Date.parse(target.kickoffAt);
  const minutesToKickoff = (kickoffMs - now.getTime()) / 60_000;
  if (target.status !== "scheduled" || !Number.isFinite(kickoffMs) || minutesToKickoff < MINIMUM_TIME_TO_KICKOFF_MINUTES) {
    throw new ModelLabValidationError("Only a scheduled fixture at least 30 minutes before kickoff can be versioned.");
  }
  if (minutesToKickoff > INITIAL_WINDOW_HOURS * 60) {
    throw new ModelLabValidationError(`Initial watchlist opens ${INITIAL_WINDOW_HOURS} hours before kickoff.`);
  }

  const [fixtureRows, statRows, oddsRows, lineupRows, contextRows, gateRows, threadRows, modelRows] = await Promise.all([
    db.select({
      id: fixtures.id,
      leagueId: fixtures.leagueId,
      season: fixtures.season,
      kickoffAt: fixtures.kickoffAt,
      homeTeamId: fixtures.homeTeamId,
      awayTeamId: fixtures.awayTeamId,
      status: fixtures.status,
      homeScore: fixtures.homeScore,
      awayScore: fixtures.awayScore,
      ingestionRunId: fixtures.ingestionRunId,
    }).from(fixtures).where(eq(fixtures.leagueId, target.leagueId)),
    db.select({
      fixtureId: teamMatchStats.fixtureId,
      teamId: teamMatchStats.teamId,
      possession: teamMatchStats.possession,
      shots: teamMatchStats.shots,
      shotsOnTarget: teamMatchStats.shotsOnTarget,
      expectedGoals: teamMatchStats.expectedGoals,
      dangerousAttacks: teamMatchStats.dangerousAttacks,
      penaltyAreaEntries: teamMatchStats.penaltyAreaEntries,
      ppda: teamMatchStats.ppda,
      bigChancesAllowed: teamMatchStats.bigChancesAllowed,
      ingestionRunId: teamMatchStats.ingestionRunId,
    }).from(teamMatchStats)
      .innerJoin(fixtures, eq(teamMatchStats.fixtureId, fixtures.id))
      .where(eq(fixtures.leagueId, target.leagueId)),
    db.select({
      id: oddsSnapshots.id,
      fixtureId: oddsSnapshots.fixtureId,
      bookmaker: oddsSnapshots.bookmaker,
      market: oddsSnapshots.market,
      selection: oddsSnapshots.selection,
      decimalOdds: oddsSnapshots.decimalOdds,
      capturedAt: oddsSnapshots.capturedAt,
      ingestionRunId: oddsSnapshots.ingestionRunId,
    }).from(oddsSnapshots)
      .innerJoin(fixtures, eq(oddsSnapshots.fixtureId, fixtures.id))
      .where(eq(fixtures.leagueId, target.leagueId)),
    db.select().from(lineupSnapshots)
      .where(and(eq(lineupSnapshots.fixtureId, target.id), lte(lineupSnapshots.capturedAt, nowIso)))
      .orderBy(desc(lineupSnapshots.capturedAt), desc(lineupSnapshots.id)),
    db.select().from(fixtureContextSnapshots)
      .where(and(
        eq(fixtureContextSnapshots.fixtureId, target.id),
        lte(fixtureContextSnapshots.capturedAt, nowIso),
      ))
      .orderBy(desc(fixtureContextSnapshots.capturedAt), desc(fixtureContextSnapshots.id))
      .limit(1),
    db.select().from(releaseGates)
      .where(and(eq(releaseGates.leagueLabel, target.leagueLabel), eq(releaseGates.market, "1X2")))
      .limit(1),
    db.select().from(predictionThreads)
      .where(and(eq(predictionThreads.fixtureId, target.id), eq(predictionThreads.market, "1X2")))
      .limit(1),
    db.select({ id: modelVersions.id })
      .from(modelVersions)
      .innerJoin(modelDefinitions, eq(modelVersions.modelDefinitionId, modelDefinitions.id))
      .where(eq(modelDefinitions.code, "form-dominance-baseline"))
      .orderBy(desc(modelVersions.createdAt))
      .limit(1),
  ]);

  const forecast = await buildUpcomingPointInTimeForecast({
    fixtures: fixtureRows,
    stats: statRows,
    odds: oddsRows,
    targetFixtureId: target.id,
    predictionAt: nowIso,
    minimumHistoryMatches: MINIMUM_HISTORY_MATCHES,
    resultAvailabilityHours: RESULT_AVAILABILITY_HOURS,
  });
  const lineup = await resolveLineupEvidence(lineupRows, target.homeTeamId, target.awayTeamId);
  const context = await resolveContextEvidence({
    row: contextRows[0] ?? null,
    fixtureId: target.id,
    predictionAt: forecast.predictionAt,
    kickoffAt: target.kickoffAt,
    baseProbabilities: forecast.probabilities,
  });
  const releaseGateAllowed = gateRows[0]?.automatedRecommendationAllowed === true;
  const researchOnly = true;
  const predictedOutcome = topOutcome(context.probabilities);
  const snapshot: VersionSnapshot = {
    predictionAt: forecast.predictionAt,
    kickoffAt: forecast.kickoffAt,
    fixtureStatus: target.status,
    probabilities: context.probabilities,
    predictedOutcome,
    dataCompleteness: forecast.dataCompleteness,
    lineupState: lineup.state,
    lineupFingerprint: lineup.fingerprint,
    contextFingerprint: context.fingerprint,
    contextCompleteness: context.completeness,
    contextEligible: context.eligible,
    releaseGateAllowed,
    researchOnly,
    featureFingerprint: forecast.featureFingerprint,
  };
  const finalization = evaluateFinalizationGate(snapshot);
  const thread = threadRows[0] ?? null;
  const previousVersion = thread?.currentVersionId
    ? (await db.select().from(predictionVersions)
      .where(eq(predictionVersions.id, thread.currentVersionId)).limit(1))[0] ?? null
    : null;
  const threadId = thread?.id ?? crypto.randomUUID();
  const valueOddsFingerprint = await predictionIdentity(oddsRows
    .filter((quote) => (
      quote.fixtureId === target.id
      && quote.market === "1X2"
      && Date.parse(quote.capturedAt) <= Date.parse(nowIso)
      && Date.parse(quote.capturedAt) < Date.parse(target.kickoffAt)
    ))
    .sort((first, second) => (
      first.bookmaker.localeCompare(second.bookmaker)
      || first.capturedAt.localeCompare(second.capturedAt)
      || first.selection.localeCompare(second.selection)
      || first.id.localeCompare(second.id)
    )));
  const versionFingerprint = await predictionIdentity({
    lifecycleSchemaVersion: PREDICTION_LIFECYCLE_SCHEMA_VERSION,
    modelCode: "form-dominance-baseline",
    modelVersionId: modelRows[0]?.id ?? null,
    baseProbabilities: forecast.probabilities,
    probabilities: context.probabilities,
    dataCompleteness: forecast.dataCompleteness,
    homeHistoryFixtureIds: forecast.featurePayload.provenance.homeHistoryFixtureIds,
    awayHistoryFixtureIds: forecast.featurePayload.provenance.awayHistoryFixtureIds,
    h2hFixtureIds: forecast.featurePayload.provenance.h2hFixtureIds,
    benchmarkHistoryFingerprint: forecast.featurePayload.provenance.benchmarkHistoryFingerprint,
    oddsCapturedAt: forecast.odds?.capturedAt ?? null,
    valueOddsFingerprint,
    lineupFingerprint: lineup.fingerprint,
    contextFingerprint: context.fingerprint,
    contextSnapshotId: context.snapshotId,
    releaseGateAllowed,
    researchOnly,
    fixtureStatus: target.status,
  });
  const historyFixtureIds = new Set([
    ...forecast.featurePayload.provenance.homeHistoryFixtureIds,
    ...forecast.featurePayload.provenance.awayHistoryFixtureIds,
    ...forecast.featurePayload.provenance.h2hFixtureIds,
  ]);
  const predictionAtMs = Date.parse(forecast.predictionAt);
  const benchmarkFixtureRows = fixtureRows.filter((row) => (
    row.status === "finished"
    && Number.isInteger(row.homeScore)
    && Number.isInteger(row.awayScore)
    && (row.homeScore ?? -1) >= 0
    && (row.awayScore ?? -1) >= 0
    && row.homeTeamId !== row.awayTeamId
    && Date.parse(row.kickoffAt) + RESULT_AVAILABILITY_HOURS * 3_600_000 <= predictionAtMs
  ));
  const selectedOddsRows = (() => {
    if (!forecast.odds) return [];
    const selectedByOutcome = new Map<string, (typeof oddsRows)[number]>();
    for (const row of oddsRows) {
      const outcome = row.selection.toUpperCase();
      if (
        row.fixtureId !== target.id
        || row.bookmaker !== forecast.odds.bookmaker
        || Date.parse(row.capturedAt) !== Date.parse(forecast.odds.capturedAt)
        || row.market.toUpperCase() !== "1X2"
        || !(["1", "X", "2"] as string[]).includes(outcome)
        || !Number.isFinite(row.decimalOdds)
        || row.decimalOdds <= 1
      ) continue;
      const current = selectedByOutcome.get(outcome);
      if (!current || row.id.localeCompare(current.id) > 0) selectedByOutcome.set(outcome, row);
    }
    return ["1", "X", "2"].flatMap((outcome) => {
      const row = selectedByOutcome.get(outcome);
      return row ? [row] : [];
    });
  })();
  const selectedLineupRows = lineupRows.filter((row) => lineup.snapshotIds.includes(row.id));
  const selectedContextRow = context.snapshotId
    ? contextRows.find((row) => row.id === context.snapshotId) ?? null
    : null;
  const sourceReferences: LineageSourceReference[] = [
    {
      purpose: "target_fixture",
      entityType: "fixture",
      entityId: target.id,
      ingestionRunId: target.ingestionRunId,
    },
    ...benchmarkFixtureRows.map((row): LineageSourceReference => ({
      purpose: "benchmark_fixture",
      entityType: "fixture",
      entityId: row.id,
      ingestionRunId: row.ingestionRunId,
    })),
    ...statRows
      .filter((row) => historyFixtureIds.has(row.fixtureId))
      .map((row): LineageSourceReference => ({
        purpose: "historical_stat",
        entityType: "team_match_stat",
        entityId: `${row.fixtureId}|${row.teamId}`,
        ingestionRunId: row.ingestionRunId,
      })),
    ...selectedOddsRows.map((row): LineageSourceReference => ({
      purpose: "market_odds",
      entityType: "odds_snapshot",
      entityId: row.id,
      ingestionRunId: row.ingestionRunId,
    })),
    ...selectedLineupRows.map((row): LineageSourceReference => ({
      purpose: "lineup",
      entityType: "lineup_snapshot",
      entityId: row.id,
      ingestionRunId: row.ingestionRunId,
    })),
    ...(selectedContextRow ? [{
      purpose: "fixture_context" as const,
      entityType: "fixture_context_snapshot" as const,
      entityId: selectedContextRow.id,
      ingestionRunId: selectedContextRow.ingestionRunId,
    }] : []),
  ];
  const buildLineageRecordValues = async (
    predictionVersionId: string,
  ): Promise<typeof predictionLineageRecords.$inferInsert> => {
    const lineage = await buildPredictionLineageManifest({
      predictionVersionId,
      threadId,
      fixtureId: target.id,
      predictionAt: forecast.predictionAt,
      featureCutoffAt: forecast.featureCutoffAt,
      featureFingerprint: forecast.featureFingerprint,
      modelCode: "form-dominance-baseline",
      modelVersionId: modelRows[0]?.id ?? null,
      normalized: {
        targetFixtureId: target.id,
        homeHistoryFixtureIds: forecast.featurePayload.provenance.homeHistoryFixtureIds,
        awayHistoryFixtureIds: forecast.featurePayload.provenance.awayHistoryFixtureIds,
        h2hFixtureIds: forecast.featurePayload.provenance.h2hFixtureIds,
        benchmarkHistoryFingerprint: forecast.featurePayload.provenance.benchmarkHistoryFingerprint,
        selectedOddsSnapshotIds: selectedOddsRows.map((row) => row.id),
        lineupSnapshotIds: lineup.snapshotIds,
        contextSnapshotId: context.snapshotId,
      },
      sourceReferences,
    });
    return {
      id: crypto.randomUUID(),
      predictionVersionId,
      threadId,
      fixtureId: target.id,
      schemaVersion: lineage.manifest.schemaVersion,
      featureFingerprint: forecast.featureFingerprint,
      featureCutoffAt: forecast.featureCutoffAt,
      modelVersionId: modelRows[0]?.id ?? null,
      manifestJson: canonicalLineageJson(lineage.manifest),
      manifestChecksumSha256: lineage.checksumSha256,
      blockerCodesJson: canonicalLineageJson(lineage.manifest.blockerCodes),
      researchOnly: true,
      recommendationEligible: false,
      createdByEmail: actor.email,
    };
  };
  if (previousVersion?.versionFingerprint === versionFingerprint) {
    const lineageValues = await buildLineageRecordValues(previousVersion.id);
    await db.insert(predictionLineageRecords).values(lineageValues)
      .onConflictDoNothing({ target: predictionLineageRecords.predictionVersionId });
    const valueAssessment = await ensureValueAssessmentForVersion(actor, previousVersion.id);
    await syncThreadValueEligibility(
      thread as typeof predictionThreads.$inferSelect,
      previousVersion.recommendationEligible,
      valueAssessment.assessment.recommendationEligible,
    );
    return {
      thread: await hydrateThreadById(thread!.id),
      version: toVersionSummary(previousVersion),
      reused: true,
      autoWithdrawn: false,
      valueAssessment: valueAssessment.assessment,
    };
  }

  const versionId = crypto.randomUUID();
  const versionNumber = (thread?.versionCount ?? 0) + 1;
  const eventSequence = (thread?.eventCount ?? 0) + 1;
  const trigger = choosePredictionTrigger({
    existingVersionCount: thread?.versionCount ?? 0,
    previousLineupState: previousVersion?.lineupState ?? null,
    currentLineupState: lineup.state,
    fixtureStatus: target.status,
  });
  const payloadJson = canonicalPredictionJson({
    lifecycleSchemaVersion: PREDICTION_LIFECYCLE_SCHEMA_VERSION,
    forecast,
    lineup: {
      state: lineup.state,
      snapshotIds: lineup.snapshotIds,
      fingerprint: lineup.fingerprint,
    },
    context: {
      snapshotId: context.snapshotId,
      snapshotFingerprint: context.snapshotFingerprint,
      fingerprint: context.fingerprint,
      assessment: context.assessment,
    },
    finalization,
    valueOddsFingerprint,
  });
  const versionValues: typeof predictionVersions.$inferInsert = {
    id: versionId,
    threadId,
    fixtureId: target.id,
    versionNumber,
    lifecycleSchemaVersion: PREDICTION_LIFECYCLE_SCHEMA_VERSION,
    trigger,
    modelCode: "form-dominance-baseline",
    modelVersionId: modelRows[0]?.id ?? null,
    predictionAt: forecast.predictionAt,
    kickoffAt: forecast.kickoffAt,
    featureCutoffAt: forecast.featureCutoffAt,
    featureFingerprint: forecast.featureFingerprint,
    versionFingerprint,
    supersedesVersionId: previousVersion?.id ?? null,
    baseProbabilityHome: forecast.probabilities.home,
    baseProbabilityDraw: forecast.probabilities.draw,
    baseProbabilityAway: forecast.probabilities.away,
    probabilityHome: context.probabilities.home,
    probabilityDraw: context.probabilities.draw,
    probabilityAway: context.probabilities.away,
    predictedOutcome,
    recommendationOutcome: finalization.eligible ? predictedOutcome : null,
    confidence: Math.max(context.probabilities.home, context.probabilities.draw, context.probabilities.away),
    dataCompleteness: forecast.dataCompleteness,
    lineupState: lineup.state,
    lineupFingerprint: lineup.fingerprint,
    lineupSnapshotIdsJson: canonicalPredictionJson(lineup.snapshotIds),
    contextSnapshotId: context.snapshotId,
    contextEngineSchemaVersion: context.assessment?.schemaVersion ?? null,
    contextFingerprint: context.fingerprint,
    contextCompleteness: context.completeness,
    contextUncertaintyShrink: context.assessment?.uncertaintyShrink ?? null,
    contextDirectionalLogit: context.assessment?.directionalLogit ?? null,
    contextEligible: context.eligible,
    contextBlockerCodesJson: canonicalPredictionJson(context.blockers),
    contextJson: canonicalPredictionJson(context.assessment),
    releaseGateAllowed,
    researchOnly,
    recommendationEligible: finalization.eligible,
    blockerCodesJson: canonicalPredictionJson(finalization.blockers),
    oddsJson: canonicalPredictionJson(forecast.odds),
    payloadJson,
    createdByEmail: actor.email,
  };
  const lineageValues = await buildLineageRecordValues(versionId);

  if (!thread) {
    const status = transitionPredictionStatus(null, "watchlisted");
    const idempotencyKey = await predictionIdentity({ threadId, event: "watchlisted", versionFingerprint });
    await db.batch([
      db.insert(predictionThreads).values({
        id: threadId,
        fixtureId: target.id,
        leagueId: target.leagueId,
        leagueLabel: target.leagueLabel,
        market: "1X2",
        status,
        currentVersionId: versionId,
        versionCount: 1,
        eventCount: 1,
        researchOnly,
        recommendationEligible: false,
        createdByEmail: actor.email,
        lastTransitionByEmail: actor.email,
        lastTransitionAt: nowIso,
        updatedAt: nowIso,
      }),
      db.insert(predictionVersions).values(versionValues),
      db.insert(predictionLineageRecords).values(lineageValues),
      db.insert(predictionEvents).values({
        id: crypto.randomUUID(),
        threadId,
        sequence: 1,
        versionId,
        eventType: "watchlisted",
        fromStatus: null,
        toStatus: status,
        reasonCode: "INITIAL_WINDOW_CREATED",
        reasonText: "Tahmin ilk 72 saatlik izleme penceresinde oluşturuldu; öneri sayılmaz.",
        actorType: "admin",
        actorEmail: actor.email,
        idempotencyKey,
        occurredAt: nowIso,
        metadataJson: canonicalPredictionJson({ trigger, blockers: finalization.blockers }),
      }),
      db.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorEmail: actor.email,
        action: "prediction.watchlisted",
        entityType: "prediction_thread",
        entityId: threadId,
        detailsJson: canonicalPredictionJson({ fixtureId: target.id, versionId, versionFingerprint }),
      }),
    ]);
    const valueAssessment = await ensureValueAssessmentForVersion(actor, versionId);
    return {
      thread: await hydrateThreadById(threadId),
      version: toVersionSummary({ ...versionValues, createdAt: nowIso } as typeof predictionVersions.$inferSelect),
      reused: false,
      autoWithdrawn: false,
      valueAssessment: valueAssessment.assessment,
    };
  }

  if (thread.status === "expired") {
    throw new ModelLabValidationError("An expired prediction thread cannot receive a new version.");
  }
  const projectedStatus = transitionPredictionStatus(thread.status, "versioned");
  const previousSnapshot = previousVersion ? toSnapshot(previousVersion, target.status) : null;
  const change = previousSnapshot ? assessMaterialChange(previousSnapshot, snapshot) : null;
  const autoWithdrawn = thread.status === "final" && change?.material === true;
  const finalStatus: PredictionStatus = autoWithdrawn ? "withdrawn" : projectedStatus;
  const versionEventKey = await predictionIdentity({ threadId, event: "versioned", versionFingerprint });
  const versionEvent = db.insert(predictionEvents).values({
      id: crypto.randomUUID(),
      threadId,
      sequence: eventSequence,
      versionId,
      eventType: "versioned" as const,
      fromStatus: thread.status,
      toStatus: projectedStatus,
      reasonCode: trigger.toUpperCase(),
      reasonText: "Yeni veri kanıtı önceki tahmini silmeden yeni bir sürüm oluşturdu.",
      actorType: "admin" as const,
      actorEmail: actor.email,
      idempotencyKey: versionEventKey,
      occurredAt: nowIso,
      metadataJson: canonicalPredictionJson({ trigger, blockers: finalization.blockers }),
    });
  const threadUpdate = db.update(predictionThreads).set({
    status: finalStatus,
    currentVersionId: versionId,
    versionCount: versionNumber,
    eventCount: eventSequence + (autoWithdrawn ? 1 : 0),
    researchOnly,
    recommendationEligible: finalStatus === "final" && finalization.eligible,
    lastTransitionByEmail: autoWithdrawn ? null : actor.email,
    lastTransitionAt: nowIso,
    updatedAt: nowIso,
  }).where(eq(predictionThreads.id, threadId));
  const auditInsert = db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    actorEmail: actor.email,
    action: autoWithdrawn ? "prediction.auto_withdrawn" : "prediction.versioned",
    entityType: "prediction_thread",
    entityId: threadId,
    detailsJson: canonicalPredictionJson({ fixtureId: target.id, versionId, versionFingerprint, change }),
  });
  if (autoWithdrawn) {
    const withdrawalKey = await predictionIdentity({ threadId, event: "withdrawn", versionFingerprint, reasons: change.reasons });
    const withdrawalEventId = crypto.randomUUID();
    const withdrawalEvent = db.insert(predictionEvents).values({
      id: withdrawalEventId,
      threadId,
      sequence: eventSequence + 1,
      versionId,
      eventType: "withdrawn",
      fromStatus: "final",
      toStatus: "withdrawn",
      reasonCode: change.reasons[0] ?? "MATERIAL_CHANGE",
      reasonText: "Final tahmin maddi veri değişikliği nedeniyle otomatik olarak geçersizleştirildi.",
      actorType: "system",
      actorEmail: null,
      idempotencyKey: withdrawalKey,
      immediateNotification: true,
      occurredAt: nowIso,
      metadataJson: canonicalPredictionJson(change),
    });
    await db.batch([
      db.insert(predictionVersions).values(versionValues),
      db.insert(predictionLineageRecords).values(lineageValues),
      versionEvent,
      withdrawalEvent,
      threadUpdate,
      auditInsert,
    ]);
    await enqueueNotificationSafely(withdrawalEventId);
  } else {
    await db.batch([
      db.insert(predictionVersions).values(versionValues),
      db.insert(predictionLineageRecords).values(lineageValues),
      versionEvent,
      threadUpdate,
      auditInsert,
    ]);
  }
  const valueAssessment = await ensureValueAssessmentForVersion(actor, versionId);
  await syncThreadValueEligibility(
    { ...thread, status: finalStatus } as typeof predictionThreads.$inferSelect,
    finalization.eligible,
    valueAssessment.assessment.recommendationEligible,
  );
  return {
    thread: await hydrateThreadById(threadId),
    version: toVersionSummary({ ...versionValues, createdAt: nowIso } as typeof predictionVersions.$inferSelect),
    reused: false,
    autoWithdrawn,
    valueAssessment: valueAssessment.assessment,
  };
}

export async function transitionPrediction(
  actor: AdminActor,
  input: { threadId: string; action: PredictionTransitionAction; reason?: string },
) {
  if (!input || typeof input.threadId !== "string" || !input.threadId.trim()) {
    throw new ModelLabValidationError("A prediction thread id is required.");
  }
  if (!( ["finalize", "withdraw", "reopen", "expire"] as string[]).includes(input.action)) {
    throw new ModelLabValidationError("The prediction transition action is invalid.");
  }
  const db = await getDb();
  const [thread] = await db.select().from(predictionThreads)
    .where(eq(predictionThreads.id, input.threadId.trim())).limit(1);
  if (!thread || !thread.currentVersionId) throw new ModelLabValidationError("The prediction thread could not be found.");
  const [[version], [fixture], latestEvents] = await Promise.all([
    db.select().from(predictionVersions).where(eq(predictionVersions.id, thread.currentVersionId)).limit(1),
    db.select().from(fixtures).where(eq(fixtures.id, thread.fixtureId)).limit(1),
    db.select().from(predictionEvents).where(eq(predictionEvents.threadId, thread.id))
      .orderBy(desc(predictionEvents.sequence)).limit(2),
  ]);
  if (!version || !fixture) throw new ModelLabValidationError("The current prediction projection is incomplete.");
  const nowIso = new Date().toISOString();
  const eventType = input.action === "finalize" ? "finalized"
    : input.action === "withdraw" ? "withdrawn"
      : input.action === "reopen" ? "reopened" : "expired";
  const nextStatus = transitionPredictionStatus(thread.status, eventType);
  if (input.action === "finalize") {
    const gate = evaluateFinalizationGate(toSnapshot(version, fixture.status));
    if (!gate.eligible) {
      throw new ModelLabValidationError(`Finalization is blocked: ${gate.blockers.join(", ")}.`);
    }
  }
  const valueAssessment = input.action === "finalize"
    ? await ensureValueAssessmentForVersion(actor, version.id)
    : null;
  if (input.action === "withdraw" && (!input.reason || input.reason.trim().length < 8)) {
    throw new ModelLabValidationError("Withdrawal requires a reason of at least 8 characters.");
  }
  if (input.action === "reopen" && latestEvents[0]?.eventType !== "versioned") {
    throw new ModelLabValidationError("A withdrawn thread needs fresh evidence before it can return to the watchlist.");
  }
  if (input.action === "expire" && Date.parse(fixture.kickoffAt) > Date.now()) {
    throw new ModelLabValidationError("A watchlist thread cannot expire before kickoff.");
  }
  const reasonCode = input.action === "finalize" ? "ALL_FINALIZATION_GATES_PASSED"
    : input.action === "withdraw" ? "ADMIN_WITHDRAWAL"
      : input.action === "reopen" ? "FRESH_EVIDENCE_REVIEW" : "KICKOFF_REACHED";
  const reasonText = input.action === "finalize" ? "Kadro ve analiz yayın kapıları geçildi; mevcut sürüm final analiz olarak kilitlendi. Bahis uygunluğu bağımsız değer katmanında kaydedildi."
    : input.action === "withdraw" ? input.reason!.trim()
      : input.action === "reopen" ? "Yeni kanıt sonrası kayıt yeniden izleme listesine alındı."
        : "Maç başladı; finalleşmemiş izleme kaydı zaman aşımına uğradı.";
  const idempotencyKey = await predictionIdentity({
    threadId: thread.id,
    eventType,
    versionId: version.id,
    sequence: thread.eventCount + 1,
  });
  const eventId = crypto.randomUUID();
  await db.batch([
    db.insert(predictionEvents).values({
      id: eventId,
      threadId: thread.id,
      sequence: thread.eventCount + 1,
      versionId: version.id,
      eventType,
      fromStatus: thread.status,
      toStatus: nextStatus,
      reasonCode,
      reasonText,
      actorType: "admin",
      actorEmail: actor.email,
      idempotencyKey,
      immediateNotification: input.action === "withdraw" && thread.status === "final",
      occurredAt: nowIso,
      metadataJson: canonicalPredictionJson({
        action: input.action,
        valueAssessmentStatus: valueAssessment?.assessment.status ?? null,
        valueRecommendationEligible: valueAssessment?.assessment.recommendationEligible ?? false,
      }),
    }),
    db.update(predictionThreads).set({
      status: nextStatus,
      finalVersionId: input.action === "finalize" ? version.id : thread.finalVersionId,
      eventCount: thread.eventCount + 1,
      recommendationEligible: nextStatus === "final"
        && version.recommendationEligible
        && valueAssessment?.assessment.recommendationEligible === true,
      lastTransitionByEmail: actor.email,
      lastTransitionAt: nowIso,
      updatedAt: nowIso,
    }).where(eq(predictionThreads.id, thread.id)),
    db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      actorEmail: actor.email,
      action: `prediction.${eventType}`,
      entityType: "prediction_thread",
      entityId: thread.id,
      detailsJson: canonicalPredictionJson({ versionId: version.id, from: thread.status, to: nextStatus, reasonCode }),
    }),
  ]);
  if (eventType === "finalized" || eventType === "withdrawn") {
    await enqueueNotificationSafely(eventId);
  }
  return {
    thread: await hydrateThreadById(thread.id),
    eventType,
    nextStatus,
    valueAssessment: valueAssessment?.assessment ?? null,
  };
}

async function syncThreadValueEligibility(
  thread: typeof predictionThreads.$inferSelect,
  analysisEligible: boolean,
  valueEligible: boolean,
) {
  if (thread.status !== "final") return;
  const recommendationEligible = analysisEligible && valueEligible;
  if (thread.recommendationEligible === recommendationEligible) return;
  const db = await getDb();
  await db.update(predictionThreads).set({ recommendationEligible, updatedAt: new Date().toISOString() })
    .where(eq(predictionThreads.id, thread.id));
}

async function hydrateThreadById(threadId: string) {
  const db = await getDb();
  const [thread] = await db.select().from(predictionThreads).where(eq(predictionThreads.id, threadId)).limit(1);
  if (!thread) throw new ModelLabValidationError("The prediction thread could not be reloaded.");
  return hydrateThread(thread);
}

async function hydrateThread(thread: typeof predictionThreads.$inferSelect) {
  const db = await getDb();
  const [[fixture], versionRows, eventRows] = await Promise.all([
    db.select().from(fixtures).where(eq(fixtures.id, thread.fixtureId)).limit(1),
    db.select().from(predictionVersions).where(eq(predictionVersions.threadId, thread.id))
      .orderBy(desc(predictionVersions.versionNumber)).limit(20),
    db.select().from(predictionEvents).where(eq(predictionEvents.threadId, thread.id))
      .orderBy(desc(predictionEvents.sequence)).limit(30),
  ]);
  const teamRows = fixture
    ? await db.select({ id: teams.id, name: teams.name }).from(teams)
      .where(inArray(teams.id, [fixture.homeTeamId, fixture.awayTeamId]))
    : [];
  const teamById = new Map(teamRows.map((row) => [row.id, row.name]));
  return {
    ...thread,
    kickoffAt: fixture?.kickoffAt ?? null,
    fixtureStatus: fixture?.status ?? null,
    homeTeamName: fixture ? teamById.get(fixture.homeTeamId) ?? fixture.homeTeamId : "Bilinmeyen ev sahibi",
    awayTeamName: fixture ? teamById.get(fixture.awayTeamId) ?? fixture.awayTeamId : "Bilinmeyen deplasman",
    versions: versionRows.map(toVersionSummary),
    events: eventRows.map(toEventSummary),
  };
}

async function resolveContextEvidence(input: {
  row: typeof fixtureContextSnapshots.$inferSelect | null;
  fixtureId: string;
  predictionAt: string;
  kickoffAt: string;
  baseProbabilities: ProbabilityTriple;
}) {
  if (!input.row) {
    return {
      snapshotId: null,
      snapshotFingerprint: null,
      fingerprint: null,
      completeness: null,
      eligible: false,
      blockers: ["CONTEXT_MISSING"],
      probabilities: input.baseProbabilities,
      assessment: null as FixtureContextAssessment | null,
    };
  }
  try {
    const assessment = evaluateFixtureContext({
      fixtureId: input.fixtureId,
      capturedAt: input.row.capturedAt,
      predictionAt: input.predictionAt,
      kickoffAt: input.kickoffAt,
      completeness: input.row.completeness,
      baseProbabilities: input.baseProbabilities,
      home: parseJson<TeamContextInput>(input.row.homeContextJson, null as never),
      away: parseJson<TeamContextInput>(input.row.awayContextJson, null as never),
      match: parseJson<MatchContextInput>(input.row.matchContextJson, null as never),
    });
    const fingerprint = await predictionIdentity({
      engineSchemaVersion: CONTEXT_ENGINE_SCHEMA_VERSION,
      snapshotFingerprint: input.row.snapshotFingerprint,
      assessment,
    });
    return {
      snapshotId: input.row.id,
      snapshotFingerprint: input.row.snapshotFingerprint,
      fingerprint,
      completeness: assessment.completeness,
      eligible: assessment.recommendationContextEligible,
      blockers: assessment.blockers,
      probabilities: assessment.adjustedProbabilities,
      assessment,
    };
  } catch {
    const fingerprint = await predictionIdentity({
      engineSchemaVersion: CONTEXT_ENGINE_SCHEMA_VERSION,
      snapshotFingerprint: input.row.snapshotFingerprint,
      invalid: true,
    });
    return {
      snapshotId: input.row.id,
      snapshotFingerprint: input.row.snapshotFingerprint,
      fingerprint,
      completeness: input.row.completeness,
      eligible: false,
      blockers: ["CONTEXT_INVALID"],
      probabilities: input.baseProbabilities,
      assessment: null as FixtureContextAssessment | null,
    };
  }
}

async function resolveLineupEvidence(
  rows: Array<typeof lineupSnapshots.$inferSelect>,
  homeTeamId: string,
  awayTeamId: string,
) {
  const projection = resolveLineupProjection(rows, homeTeamId, awayTeamId);
  const selected = projection.selected;
  return {
    state: projection.state,
    snapshotIds: selected.map((row) => row.id),
    fingerprint: selected.length ? await predictionIdentity(selected.map((row) => ({
      id: row.id,
      teamId: row.teamId,
      status: row.status,
      capturedAt: row.capturedAt,
      playersJson: row.playersJson,
      unavailablePlayersJson: row.unavailablePlayersJson,
    }))) : null,
  };
}

function resolveLineupProjection(
  rows: Array<typeof lineupSnapshots.$inferSelect>,
  homeTeamId: string,
  awayTeamId: string,
) {
  const latest = new Map<string, typeof lineupSnapshots.$inferSelect>();
  for (const row of rows) {
    if ((row.teamId === homeTeamId || row.teamId === awayTeamId) && !latest.has(row.teamId)) {
      latest.set(row.teamId, row);
    }
  }
  const selected = [latest.get(homeTeamId), latest.get(awayTeamId)]
    .filter((row): row is typeof lineupSnapshots.$inferSelect => Boolean(row));
  const state: LineupState = selected.length === 2 && selected.every((row) => row.status === "confirmed")
    ? "confirmed" : selected.length ? "probable" : "none";
  return { state, selected };
}

function toSnapshot(
  row: typeof predictionVersions.$inferSelect,
  fixtureStatus: VersionSnapshot["fixtureStatus"],
): VersionSnapshot {
  return {
    versionId: row.id,
    predictionAt: row.predictionAt,
    kickoffAt: row.kickoffAt,
    fixtureStatus,
    probabilities: {
      home: row.probabilityHome,
      draw: row.probabilityDraw,
      away: row.probabilityAway,
    },
    predictedOutcome: row.predictedOutcome,
    dataCompleteness: row.dataCompleteness,
    lineupState: row.lineupState,
    lineupFingerprint: row.lineupFingerprint,
    contextFingerprint: row.contextFingerprint,
    contextCompleteness: row.contextCompleteness,
    contextEligible: row.contextEligible,
    releaseGateAllowed: row.releaseGateAllowed,
    researchOnly: row.researchOnly,
    featureFingerprint: row.featureFingerprint,
  };
}

function toVersionSummary(row: typeof predictionVersions.$inferSelect) {
  return {
    id: row.id,
    versionNumber: row.versionNumber,
    trigger: row.trigger,
    modelCode: row.modelCode,
    modelVersionId: row.modelVersionId,
    predictionAt: row.predictionAt,
    kickoffAt: row.kickoffAt,
    featureCutoffAt: row.featureCutoffAt,
    featureFingerprint: row.featureFingerprint,
    versionFingerprint: row.versionFingerprint,
    supersedesVersionId: row.supersedesVersionId,
    probabilities: {
      home: row.probabilityHome,
      draw: row.probabilityDraw,
      away: row.probabilityAway,
    },
    baseProbabilities: row.baseProbabilityHome === null
      || row.baseProbabilityDraw === null
      || row.baseProbabilityAway === null
      ? null
      : {
        home: row.baseProbabilityHome,
        draw: row.baseProbabilityDraw,
        away: row.baseProbabilityAway,
      },
    predictedOutcome: row.predictedOutcome,
    recommendationOutcome: row.recommendationOutcome,
    confidence: row.confidence,
    dataCompleteness: row.dataCompleteness,
    lineupState: row.lineupState,
    lineupFingerprint: row.lineupFingerprint,
    contextSnapshotId: row.contextSnapshotId,
    contextEngineSchemaVersion: row.contextEngineSchemaVersion,
    contextFingerprint: row.contextFingerprint,
    contextCompleteness: row.contextCompleteness,
    contextUncertaintyShrink: row.contextUncertaintyShrink,
    contextDirectionalLogit: row.contextDirectionalLogit,
    contextEligible: row.contextEligible,
    contextBlockerCodes: parseJson<string[]>(row.contextBlockerCodesJson, []),
    releaseGateAllowed: row.releaseGateAllowed,
    researchOnly: row.researchOnly,
    recommendationEligible: row.recommendationEligible,
    blockerCodes: parseJson<string[]>(row.blockerCodesJson, []),
    odds: parseJson<Record<string, unknown> | null>(row.oddsJson, null),
    createdAt: row.createdAt,
  };
}

function toEventSummary(row: typeof predictionEvents.$inferSelect) {
  return {
    id: row.id,
    sequence: row.sequence,
    versionId: row.versionId,
    eventType: row.eventType,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    reasonCode: row.reasonCode,
    reasonText: row.reasonText,
    actorType: row.actorType,
    actorEmail: row.actorEmail,
    immediateNotification: row.immediateNotification,
    occurredAt: row.occurredAt,
  };
}

function groupEvents(rows: Array<typeof predictionEvents.$inferSelect>) {
  const result = new Map<string, Array<typeof predictionEvents.$inferSelect>>();
  for (const row of rows) result.set(row.threadId, [...(result.get(row.threadId) ?? []), row]);
  return result;
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function enqueueNotificationSafely(eventId: string) {
  try {
    return await enqueuePredictionNotificationEvent(eventId);
  } catch (error) {
    console.error("Prediction transition committed but notification enqueue failed", {
      eventId,
      error: error instanceof Error ? error.message : "UNKNOWN_NOTIFICATION_ERROR",
    });
    return null;
  }
}
