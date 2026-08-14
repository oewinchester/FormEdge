import { and, desc, eq, gte, inArray, lt, lte, or } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLogs,
  fixtures,
  forwardShadowObservations,
  modelEvidenceRuns,
  researchAutomationRuns,
  researchFixtureFeedRuns,
} from "@/db/schema";
import {
  importFootballSnapshot,
  type AdminActor,
} from "@/lib/admin-data";
import {
  SPORTMONKS_ADAPTER_VERSION,
  SPORTMONKS_MAX_BYTES,
  SPORTMONKS_MAX_PAGES_PER_DATE,
  SPORTMONKS_PLAN_LEAGUES,
  buildSportMonksAccountUrls,
  buildSportMonksDateUrls,
  buildSportMonksTeamHistoryUrl,
  mergeSportMonksRateLimits,
  parseSportMonksAccountCoverage,
  parseSportMonksFixtures,
  readSportMonksRateLimit,
  selectSportMonksTeamHistory,
  sportMonksAuthorizationHeader,
  sportMonksPageUrl,
  sportMonksPlanTeamTargets,
  sportMonksTeamId,
} from "@/lib/sportmonks-live";
import {
  createPredictionVersion,
  getPredictionOpsOverview,
} from "@/lib/prediction-lifecycle-store";
import {
  defaultShadowValidationThresholds,
  evaluateShadowValidation,
} from "@/lib/shadow-validation";
import {
  evaluateResearchOperationsGate,
  summarizeAutomationHealth,
} from "@/lib/research-automation-health";
import { getIstanbulSlateWindow } from "@/lib/today-slate";
import { ModelLabValidationError } from "@/lib/model-lab";

const AUTOMATION_ACTIVE_KEY = "research-forward-shadow:1x2";
const FIXTURE_FEED_ACTIVE_KEY = "sportmonks:fixtures:v11";
const FEED_WINDOW_MS = 10 * 60_000;
const FETCH_TIMEOUT_MS = 20_000;
const MIN_TEAM_HISTORY_MATCHES = 5;
const MAX_HISTORY_FIXTURES_PER_TEAM = 12;
const MAX_HISTORY_TEAM_REQUESTS_PER_RUN = 24;
const MAX_UPSTREAM_SUBREQUESTS_PER_RUN = 40;
const MAX_SPORTMONKS_PAGE_BYTES = 8_000_000;
const MAX_PREDICTIONS_PER_CYCLE = 60;
const MAX_SETTLEMENTS_PER_CYCLE = 300;

export const SYSTEM_RESEARCH_ACTOR: AdminActor = {
  email: "scheduler@system.formedge",
  displayName: "FormEdge Research Scheduler",
  role: "admin",
};

export class ResearchAutomationHttpError extends Error {
  constructor(
    public status: 403 | 409 | 502 | 503,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ResearchAutomationHttpError";
  }
}

export async function pullResearchFixtureFeed(actor: AdminActor) {
  requireAutomationAdmin(actor);
  const db = await getDb();
  const now = new Date();
  const nowIso = now.toISOString();
  const runtime = await getResearchAutomationRuntime();
  const sportMonksToken = runtime.SPORTMONKS_API_TOKEN?.trim() || null;
  const provider = buildSportMonksProvider(sportMonksToken, nowIso);
  const upstreamUrl = provider.upstreamUrl;
  const adapterVersion = provider.adapterVersion;
  await db.update(researchFixtureFeedRuns).set({
    activeKey: null,
    status: "failed",
    errorCode: "STALE_FIXTURE_FEED_LOCK",
    errorMessage: "Önceki fikstür çekimi zaman sınırını aştığı için kilit güvenli biçimde bırakıldı.",
    completedAt: nowIso,
  }).where(and(
    eq(researchFixtureFeedRuns.activeKey, FIXTURE_FEED_ACTIVE_KEY),
    eq(researchFixtureFeedRuns.status, "fetching"),
    lt(researchFixtureFeedRuns.startedAt, new Date(now.getTime() - 30 * 60_000).toISOString()),
  ));
  const providerKey = provider.key;
  const istanbulDay = getIstanbulSlateWindow(now);
  const successfulToday = await db.select().from(researchFixtureFeedRuns)
    .where(and(
      inArray(researchFixtureFeedRuns.status, ["imported", "unchanged"]),
      gte(researchFixtureFeedRuns.startedAt, istanbulDay.startIso),
      lte(researchFixtureFeedRuns.startedAt, istanbulDay.todayEndIso),
    ))
    .orderBy(desc(researchFixtureFeedRuns.startedAt)).limit(30);
  const dailySnapshot = successfulToday.find((row) => (
    row.id.startsWith(`fdfix:${providerKey}:`) && (row.pilotRowCount ?? 0) > 0
    && fixtureFeedHistoryBackfillComplete(row.providerSummaryJson)
  ));
  if (dailySnapshot) {
    console.info("fixture-feed-daily-cache-hit", JSON.stringify({
      providerKey,
      runId: dailySnapshot.id,
      istanbulDay: istanbulDay.startIso.slice(0, 10),
      sourceRowCount: dailySnapshot.sourceRowCount,
      importedFixtureCount: dailySnapshot.pilotRowCount,
    }));
    return { run: publicFixtureFeedRun(dailySnapshot), reused: true, cacheScope: "istanbul_day" as const };
  }
  const runId = `fdfix:${providerKey}:${Math.floor(now.getTime() / FEED_WINDOW_MS)}`;
  const inserted = await db.insert(researchFixtureFeedRuns).values({
    id: runId,
    activeKey: FIXTURE_FEED_ACTIVE_KEY,
    adapterVersion,
    upstreamUrl,
    status: "fetching",
    requestedByEmail: actor.email,
    startedAt: nowIso,
  }).onConflictDoNothing();
  if (changedRows(inserted) === 0) {
    const [existing] = await db.select().from(researchFixtureFeedRuns)
      .where(eq(researchFixtureFeedRuns.id, runId)).limit(1);
    const [active] = existing ? [existing] : await db.select().from(researchFixtureFeedRuns)
      .where(eq(researchFixtureFeedRuns.activeKey, FIXTURE_FEED_ACTIVE_KEY)).limit(1);
    if (active?.status === "failed") {
      throw new ResearchAutomationHttpError(502, active.errorCode ?? "FIXTURE_FEED_FAILED", active.errorMessage ?? "Fikstür akışı alınamadı.");
    }
    if (active) return { run: publicFixtureFeedRun(active), reused: true };
    throw new ResearchAutomationHttpError(409, "FIXTURE_FEED_CONFLICT", "Fikstür akışı aynı anda başka bir işlem tarafından alınıyor.");
  }

  let responseStatus: number | null = null;
  let responseContentType: string | null = null;
  let upstreamEtag: string | null = null;
  let upstreamLastModified: string | null = null;
  let rawSnapshotKey: string | null = null;
  let rawChecksumSha256: string | null = null;
  let contentBytes = 0;

  try {
    const fetched = await fetchSportMonksFixtures(provider);
    const { response, responseBuffer, providerSummary } = fetched;
    responseStatus = response.status;
    responseContentType = fetched.responseContentType;
    upstreamEtag = fetched.upstreamEtag;
    upstreamLastModified = fetched.upstreamLastModified;
    const [previous] = await db.select().from(researchFixtureFeedRuns)
      .where(and(
        eq(researchFixtureFeedRuns.upstreamUrl, upstreamUrl),
        eq(researchFixtureFeedRuns.status, "imported"),
      ))
      .orderBy(desc(researchFixtureFeedRuns.startedAt)).limit(1);
    if (response.status === 304 && previous) {
      await completeUnchangedFixtureFeed(runId, previous, {
        httpStatus: response.status,
        responseContentType,
        upstreamEtag: upstreamEtag ?? previous.upstreamEtag,
        upstreamLastModified: upstreamLastModified ?? previous.upstreamLastModified,
        providerSummaryJson: JSON.stringify(providerSummary),
      });
      return { run: await loadPublicFixtureFeedRun(runId), reused: true };
    }
    const bytes = new Uint8Array(responseBuffer);
    contentBytes = bytes.byteLength;
    if (contentBytes > provider.maximumBytes) {
      throw new ResearchAutomationHttpError(502, "FIXTURE_FEED_TOO_LARGE", "Birleşik SportMonks yanıtı 32 MB güvenlik sınırını aşıyor.");
    }
    rawChecksumSha256 = await sha256(responseBuffer);
    if (previous?.rawChecksumSha256 === rawChecksumSha256) {
      await completeUnchangedFixtureFeed(runId, previous, {
        httpStatus: response.status,
        responseContentType,
        upstreamEtag,
        upstreamLastModified,
        contentBytes,
        rawChecksumSha256,
        providerSummaryJson: JSON.stringify(providerSummary),
      });
      return { run: await loadPublicFixtureFeedRun(runId), reused: true };
    }

    const rawText = new TextDecoder("utf-8").decode(bytes);
    const parsed = parseSportMonksFixtures({ json: rawText, capturedAt: nowIso, upstreamUrl });
    rawSnapshotKey = `research/sportmonks/fixtures/${rawChecksumSha256}.json`;
    await (await getBucket()).put(rawSnapshotKey, bytes, {
      httpMetadata: { contentType: responseContentType || "application/json; charset=utf-8" },
      customMetadata: {
        source: provider.kind,
        adapterVersion,
        fetchedAt: nowIso,
        checksumSha256: rawChecksumSha256,
      },
    });
    const ingestionRunIds: string[] = [];
    for (const envelope of parsed.envelopes) {
      const imported = await importFootballSnapshot(actor, envelope, {
        importFormat: "json",
        externalIssues: parsed.qualityIssues,
        forceResearchOnlyReason: "Fikstür kaynağının ticari yeniden kullanım ve yayın kapıları doğrulanmadığı için kullanıcı önerisi üretilemez.",
      });
      ingestionRunIds.push(imported.runId);
    }
    const importedLeagueCount = new Set(parsed.envelopes.map((envelope) => envelope.payload.league.id)).size;
    await db.update(researchFixtureFeedRuns).set({
      activeKey: null,
      status: "imported",
      httpStatus: response.status,
      responseContentType,
      upstreamEtag,
      upstreamLastModified,
      rawSnapshotKey,
      rawChecksumSha256,
      contentBytes,
      sourceRowCount: parsed.sourceRowCount,
      pilotRowCount: parsed.pilotRowCount,
      leagueCount: importedLeagueCount,
      oddsSnapshotCount: parsed.oddsSnapshotCount,
      providerSummaryJson: JSON.stringify(providerSummary),
      ingestionRunIdsJson: JSON.stringify(ingestionRunIds),
      completedAt: new Date().toISOString(),
    }).where(eq(researchFixtureFeedRuns.id, runId));
    console.info("fixture-feed-completed", JSON.stringify({
      provider: provider.kind,
      adapterVersion,
      sourceRowCount: parsed.sourceRowCount,
      importedFixtureCount: parsed.pilotRowCount,
      leagueCount: importedLeagueCount,
      status: "imported",
    }));
    return { run: await loadPublicFixtureFeedRun(runId), reused: false };
  } catch (error) {
    const normalized = normalizeAutomationError(error, "FIXTURE_FEED_FAILED", "Fikstür akışı güvenli biçimde alınamadı.");
    console.error("fixture-feed-failed", JSON.stringify({
      provider: provider.kind,
      adapterVersion,
      code: normalized.code,
      message: normalized.message,
      responseStatus,
    }));
    await db.update(researchFixtureFeedRuns).set({
      activeKey: null,
      status: "failed",
      httpStatus: responseStatus,
      responseContentType,
      upstreamEtag,
      upstreamLastModified,
      rawSnapshotKey,
      rawChecksumSha256,
      contentBytes,
      errorCode: normalized.code,
      errorMessage: normalized.message.slice(0, 500),
      completedAt: new Date().toISOString(),
    }).where(eq(researchFixtureFeedRuns.id, runId));
    throw normalized;
  }
}

export async function runResearchAutomationCycle(
  actor: AdminActor,
  trigger: "admin" | "scheduler" = "admin",
) {
  requireAutomationAdmin(actor);
  const db = await getDb();
  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  await db.update(researchAutomationRuns).set({
    activeKey: null,
    status: "failed",
    errorCode: "STALE_AUTOMATION_LOCK",
    errorMessage: "Önceki otomasyon turu zaman sınırını aştığı için kilit güvenli biçimde bırakıldı.",
    completedAt: startedAt,
  }).where(and(
    eq(researchAutomationRuns.activeKey, AUTOMATION_ACTIVE_KEY),
    eq(researchAutomationRuns.status, "running"),
    lt(researchAutomationRuns.startedAt, new Date(Date.parse(startedAt) - 45 * 60_000).toISOString()),
  ));
  const inserted = await db.insert(researchAutomationRuns).values({
    id: runId,
    activeKey: AUTOMATION_ACTIVE_KEY,
    jobKind: "forward_shadow",
    trigger,
    status: "running",
    actorEmail: actor.email,
    startedAt,
  }).onConflictDoNothing();
  if (changedRows(inserted) === 0) {
    const [active] = await db.select().from(researchAutomationRuns)
      .where(eq(researchAutomationRuns.activeKey, AUTOMATION_ACTIVE_KEY)).limit(1);
    if (active) return { run: publicAutomationRun(active), reused: true };
    throw new ResearchAutomationHttpError(409, "AUTOMATION_CONFLICT", "Araştırma otomasyonu aynı anda başka bir tur çalıştırıyor.");
  }

  const errors: Array<{ stage: string; code: string; message: string }> = [];
  let fixtureFeedRunId: string | null = null;
  let liveLeagueCode: string | null = null;
  let liveResultStatus: string | null = null;
  let candidateCount = 0;
  let predictionsCreated = 0;
  let predictionsReused = 0;
  let predictionsFailed = 0;
  let observationsCaptured = 0;
  let observationsSettled = 0;

  try {
    try {
      const feed = await pullResearchFixtureFeed(actor);
      fixtureFeedRunId = feed.run?.id ?? null;
    } catch (error) {
      const failure = errorSummary("fixture_feed", error);
      errors.push(failure);
      console.error("research-automation-fixture-feed-failed", JSON.stringify(failure));
    }

    const runtime = await getResearchAutomationRuntime();
    liveLeagueCode = "sportmonks";
    liveResultStatus = runtime.SPORTMONKS_API_TOKEN?.trim()
      ? "covered_by_sportmonks"
      : "failed:SPORTMONKS_NOT_CONFIGURED";
    if (!runtime.SPORTMONKS_API_TOKEN?.trim()) {
      errors.push({
        stage: "live_results",
        code: "SPORTMONKS_NOT_CONFIGURED",
        message: "SportMonks API anahtarı sunucu ortamında yapılandırılmamış.",
      });
    }

    const settledBefore = await settleForwardShadowObservations();
    observationsSettled += settledBefore.settled;
    const ops = await getPredictionOpsOverview(actor);
    const candidates = selectAutomationCandidates(ops.candidates, MAX_PREDICTIONS_PER_CYCLE);
    candidateCount = ops.candidates.length;
    for (const candidate of candidates) {
      try {
        const prediction = await createPredictionVersion(actor, candidate.id);
        if (prediction.reused) predictionsReused += 1;
        else predictionsCreated += 1;
        observationsCaptured += await captureForwardShadowObservation(prediction, actor);
      } catch (error) {
        predictionsFailed += 1;
        errors.push(errorSummary(`prediction:${candidate.id}`, error));
      }
    }
    const settledAfter = await settleForwardShadowObservations();
    observationsSettled += settledAfter.settled;
    const observationsPending = await pendingObservationCount();
    const completedAt = new Date().toISOString();
    const infrastructureErrors = errors.filter((item) => item.stage === "fixture_feed" || item.stage === "live_results");
    const predictionErrors = errors.filter((item) => item.stage.startsWith("prediction:"));
    const status = infrastructureErrors.length || predictionErrors.length ? "partial" as const : "completed" as const;
    const summary = {
      fixtureFeed: fixtureFeedRunId,
      liveLeagueCode,
      liveResultStatus,
      predictionLimit: MAX_PREDICTIONS_PER_CYCLE,
      predictionErrors: predictionErrors.slice(0, 60),
      infrastructureErrors,
      settlement: { before: settledBefore, after: settledAfter },
      researchOnly: true,
      recommendationEligible: false,
    };
    await db.update(researchAutomationRuns).set({
      activeKey: null,
      status,
      fixtureFeedRunId,
      liveLeagueCode,
      liveResultStatus,
      candidateCount,
      predictionsCreated,
      predictionsReused,
      predictionsFailed,
      observationsCaptured,
      observationsSettled,
      observationsPending,
      summaryJson: JSON.stringify(summary),
      completedAt,
    }).where(eq(researchAutomationRuns.id, runId));
    await db.insert(auditLogs).values({
      id: crypto.randomUUID(),
      actorEmail: actor.email,
      action: "research.automation.completed",
      entityType: "research_automation_run",
      entityId: runId,
      detailsJson: JSON.stringify({ trigger, status, candidateCount, predictionsCreated, observationsCaptured, observationsSettled }),
    });
    console.info("research-automation-completed", JSON.stringify({
      status,
      candidateCount,
      predictionsCreated,
      predictionsReused,
      predictionsFailed,
      observationsCaptured,
      predictionErrors: summary.predictionErrors,
    }));
    return { run: await loadPublicAutomationRun(runId), reused: false };
  } catch (error) {
    const normalized = normalizeAutomationError(error, "AUTOMATION_FAILED", "Araştırma otomasyonu tamamlanamadı.");
    await db.update(researchAutomationRuns).set({
      activeKey: null,
      status: "failed",
      fixtureFeedRunId,
      liveLeagueCode,
      liveResultStatus,
      candidateCount,
      predictionsCreated,
      predictionsReused,
      predictionsFailed,
      observationsCaptured,
      observationsSettled,
      summaryJson: JSON.stringify({ errors }),
      errorCode: normalized.code,
      errorMessage: normalized.message.slice(0, 500),
      completedAt: new Date().toISOString(),
    }).where(eq(researchAutomationRuns.id, runId));
    throw normalized;
  }
}

export async function getResearchAutomationOverview(actor: AdminActor) {
  const db = await getDb();
  const generatedAt = new Date().toISOString();
  const [runRows, feedRows, observationRows, evidenceRows] = await Promise.all([
    db.select().from(researchAutomationRuns).orderBy(desc(researchAutomationRuns.startedAt)).limit(120),
    db.select().from(researchFixtureFeedRuns).orderBy(desc(researchFixtureFeedRuns.startedAt)).limit(20),
    db.select().from(forwardShadowObservations).orderBy(desc(forwardShadowObservations.kickoffAt)).limit(1000),
    db.select().from(modelEvidenceRuns)
      .where(eq(modelEvidenceRuns.status, "completed"))
      .orderBy(desc(modelEvidenceRuns.completedAt)).limit(100),
  ]);
  const forwardRunRows = runRows.filter((row) => row.jobKind === "forward_shadow");
  const historicalRunRows = runRows.filter((row) => row.jobKind === "historical_validation");
  const latestEvidenceByLeague = new Map<string, typeof evidenceRows[number]>();
  for (const row of evidenceRows) if (!latestEvidenceByLeague.has(row.leagueId)) latestEvidenceByLeague.set(row.leagueId, row);
  const leagues = SPORTMONKS_PLAN_LEAGUES.map((league) => {
    const rows = observationRows.filter((row) => row.leagueId === league.id);
    const settled = rows.filter((row) => row.status === "settled" && row.actualOutcome && row.resultKnownAt);
    const evidence = latestEvidenceByLeague.get(league.id);
    const validation = evaluateShadowValidation({
      observations: settled.map((row) => ({
        fixtureId: row.fixtureId,
        predictionAt: row.observedAt,
        kickoffAt: row.kickoffAt,
        featureCutoffAt: row.featureCutoffAt,
        resultKnownAt: row.resultKnownAt!,
        actualOutcome: row.actualOutcome!,
        probabilities: {
          home: row.probabilityHome,
          draw: row.probabilityDraw,
          away: row.probabilityAway,
        },
        dataCompleteness: row.dataCompleteness,
      })),
      researchOnly: true,
      forwardObserved: settled.length > 0,
      commercialReuseVerified: false,
      revisionTimingVerified: false,
      evidenceCompleted: Boolean(evidence),
      evidenceStatus: evidence?.evidenceStatus,
    });
    return {
      leagueCode: league.code,
      leagueId: league.id,
      leagueLabel: league.name,
      countryCode: league.countryCode,
      pending: rows.filter((row) => row.status === "pending").length,
      settled: settled.length,
      void: rows.filter((row) => row.status === "void").length,
      invalid: rows.filter((row) => row.status === "invalid").length,
      target: defaultShadowValidationThresholds.minimumTotalSamples,
      progress: Math.min(1, settled.length / defaultShadowValidationThresholds.minimumTotalSamples),
      evidenceStatus: evidence?.evidenceStatus ?? "not_completed",
      validation,
    };
  });
  const totals = {
    fixtureFeedRuns: feedRows.length,
    automationRuns: forwardRunRows.length,
    historicalAutomationRuns: historicalRunRows.length,
    pending: observationRows.filter((row) => row.status === "pending").length,
    settled: observationRows.filter((row) => row.status === "settled").length,
    void: observationRows.filter((row) => row.status === "void").length,
    invalid: observationRows.filter((row) => row.status === "invalid").length,
  };
  const forwardHealth = summarizeAutomationHealth(forwardRunRows, generatedAt);
  const historicalHealth = summarizeAutomationHealth(historicalRunRows, generatedAt);
  return {
    generatedAt,
    actor: { email: actor.email, displayName: actor.displayName, role: actor.role },
    source: {
      name: "SportMonks Football API v3",
      url: feedRows[0]?.upstreamUrl ?? buildSportMonksDateUrls(generatedAt)[0],
      adapterVersion: feedRows[0]?.adapterVersion ?? SPORTMONKS_ADAPTER_VERSION,
      commercialReuseVerified: false,
      revisionTimingVerified: false,
      marketCaptureTimingVerified: false,
    },
    totals,
    policy: {
      cron: "17 * * * *",
      cadence: "hourly" as const,
      maximumPredictionsPerCycle: MAX_PREDICTIONS_PER_CYCLE,
      minimumForwardSamplesPerLeague: defaultShadowValidationThresholds.minimumTotalSamples,
      currentSeason: "SportMonks rolling 365-day team history",
      researchOnly: true,
      recommendationEligible: false,
      forwardObserved: totals.settled > 0,
    },
    latestRun: forwardRunRows[0] ? publicAutomationRun(forwardRunRows[0]) : null,
    health: forwardHealth,
    operationsGate: evaluateResearchOperationsGate(forwardHealth, historicalHealth),
    latestFeedRun: feedRows[0] ? publicFixtureFeedRun(feedRows[0]) : null,
    leagues,
    recentRuns: forwardRunRows.map(publicAutomationRun),
    recentFeedRuns: feedRows.map(publicFixtureFeedRun),
    historical: {
      policy: {
        cron: "47 * * * *",
        cadence: "hourly" as const,
        maximumStagesPerCycle: 1,
        researchOnly: true,
        recommendationEligible: false,
      },
      latestRun: historicalRunRows[0] ? publicAutomationRun(historicalRunRows[0]) : null,
      health: historicalHealth,
      recentRuns: historicalRunRows.map(publicAutomationRun),
    },
  };
}

export function selectAutomationCandidates<T extends { id: string; kickoffAt: string; existingThreadId: string | null }>(
  candidates: T[],
  limit = MAX_PREDICTIONS_PER_CYCLE,
) {
  return [...candidates].sort((first, second) => (
    Number(Boolean(first.existingThreadId)) - Number(Boolean(second.existingThreadId))
    || first.kickoffAt.localeCompare(second.kickoffAt)
    || first.id.localeCompare(second.id)
  )).slice(0, Math.max(0, Math.floor(limit)));
}

async function captureForwardShadowObservation(
  prediction: Awaited<ReturnType<typeof createPredictionVersion>>,
  actor: AdminActor,
) {
  const db = await getDb();
  const observedAt = new Date().toISOString();
  const { thread, version } = prediction;
  const validChronology = Date.parse(observedAt) < Date.parse(version.kickoffAt)
    && Date.parse(version.predictionAt) < Date.parse(version.kickoffAt)
    && Date.parse(version.featureCutoffAt) <= Date.parse(version.predictionAt);
  const inserted = await db.insert(forwardShadowObservations).values({
    id: crypto.randomUUID(),
    fixtureId: thread.fixtureId,
    predictionThreadId: thread.id,
    predictionVersionId: version.id,
    leagueId: thread.leagueId,
    leagueLabel: thread.leagueLabel,
    market: "1X2",
    modelCode: version.modelCode,
    modelVersionId: version.modelVersionId,
    status: validChronology ? "pending" : "invalid",
    observedAt,
    predictionAt: version.predictionAt,
    kickoffAt: version.kickoffAt,
    featureCutoffAt: version.featureCutoffAt,
    probabilityHome: version.probabilities.home,
    probabilityDraw: version.probabilities.draw,
    probabilityAway: version.probabilities.away,
    predictedOutcome: version.predictedOutcome,
    confidence: version.confidence,
    dataCompleteness: version.dataCompleteness,
    featureFingerprint: version.featureFingerprint,
    versionFingerprint: version.versionFingerprint,
    oddsJson: JSON.stringify(version.odds),
    researchOnly: true,
    createdByEmail: actor.email,
  }).onConflictDoNothing();
  return changedRows(inserted);
}

async function settleForwardShadowObservations() {
  const db = await getDb();
  const rows = await db.select({
    observation: forwardShadowObservations,
    fixtureStatus: fixtures.status,
    fixtureHomeScore: fixtures.homeScore,
    fixtureAwayScore: fixtures.awayScore,
  }).from(forwardShadowObservations)
    .innerJoin(fixtures, eq(forwardShadowObservations.fixtureId, fixtures.id))
    .where(eq(forwardShadowObservations.status, "pending"))
    .orderBy(forwardShadowObservations.kickoffAt)
    .limit(MAX_SETTLEMENTS_PER_CYCLE);
  let settled = 0;
  let voided = 0;
  let invalid = 0;
  for (const row of rows) {
    const observation = row.observation;
    const chronologyValid = Date.parse(observation.observedAt) < Date.parse(observation.kickoffAt)
      && Date.parse(observation.predictionAt) < Date.parse(observation.kickoffAt)
      && Date.parse(observation.featureCutoffAt) <= Date.parse(observation.predictionAt);
    if (!chronologyValid) {
      await db.update(forwardShadowObservations).set({ status: "invalid", updatedAt: new Date().toISOString() })
        .where(eq(forwardShadowObservations.id, observation.id));
      invalid += 1;
      continue;
    }
    if (row.fixtureStatus === "cancelled") {
      await db.update(forwardShadowObservations).set({ status: "void", settledAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
        .where(eq(forwardShadowObservations.id, observation.id));
      voided += 1;
      continue;
    }
    if (row.fixtureStatus !== "finished" || row.fixtureHomeScore === null || row.fixtureAwayScore === null) continue;
    const actualOutcome = row.fixtureHomeScore > row.fixtureAwayScore ? "1" : row.fixtureHomeScore < row.fixtureAwayScore ? "2" : "X";
    const resultKnownAt = new Date().toISOString();
    await db.update(forwardShadowObservations).set({
      status: "settled",
      actualOutcome,
      homeScore: row.fixtureHomeScore,
      awayScore: row.fixtureAwayScore,
      resultKnownAt,
      settledAt: resultKnownAt,
      updatedAt: resultKnownAt,
    }).where(eq(forwardShadowObservations.id, observation.id));
    settled += 1;
  }
  return { inspected: rows.length, settled, voided, invalid };
}

async function pendingObservationCount() {
  const db = await getDb();
  const rows = await db.select({ id: forwardShadowObservations.id }).from(forwardShadowObservations)
    .where(eq(forwardShadowObservations.status, "pending"));
  return rows.length;
}

async function completeUnchangedFixtureFeed(
  runId: string,
  previous: typeof researchFixtureFeedRuns.$inferSelect,
  overrides: Partial<typeof researchFixtureFeedRuns.$inferInsert>,
) {
  const db = await getDb();
  await db.update(researchFixtureFeedRuns).set({
    activeKey: null,
    status: "unchanged",
    httpStatus: previous.httpStatus,
    responseContentType: previous.responseContentType,
    upstreamEtag: previous.upstreamEtag,
    upstreamLastModified: previous.upstreamLastModified,
    rawSnapshotKey: previous.rawSnapshotKey,
    rawChecksumSha256: previous.rawChecksumSha256,
    contentBytes: previous.contentBytes,
    sourceRowCount: previous.sourceRowCount,
    pilotRowCount: previous.pilotRowCount,
    leagueCount: previous.leagueCount,
    oddsSnapshotCount: previous.oddsSnapshotCount,
    providerSummaryJson: previous.providerSummaryJson,
    ingestionRunIdsJson: previous.ingestionRunIdsJson,
    completedAt: new Date().toISOString(),
    ...overrides,
  }).where(eq(researchFixtureFeedRuns.id, runId));
}

async function loadPublicFixtureFeedRun(id: string) {
  const db = await getDb();
  const [row] = await db.select().from(researchFixtureFeedRuns).where(eq(researchFixtureFeedRuns.id, id)).limit(1);
  return row ? publicFixtureFeedRun(row) : null;
}

async function loadPublicAutomationRun(id: string) {
  const db = await getDb();
  const [row] = await db.select().from(researchAutomationRuns).where(eq(researchAutomationRuns.id, id)).limit(1);
  return row ? publicAutomationRun(row) : null;
}

function publicFixtureFeedRun(row: typeof researchFixtureFeedRuns.$inferSelect) {
  return {
    id: row.id,
    adapterVersion: row.adapterVersion,
    upstreamUrl: row.upstreamUrl,
    status: row.status,
    httpStatus: row.httpStatus,
    upstreamLastModified: row.upstreamLastModified,
    checksumSha256: row.rawChecksumSha256,
    contentBytes: row.contentBytes,
    sourceRowCount: row.sourceRowCount,
    pilotRowCount: row.pilotRowCount,
    leagueCount: row.leagueCount,
    oddsSnapshotCount: row.oddsSnapshotCount,
    providerSummary: parseJson<Record<string, unknown>>(row.providerSummaryJson, {}),
    ingestionRunIds: parseJson<string[]>(row.ingestionRunIdsJson, []),
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
  };
}

function publicAutomationRun(row: typeof researchAutomationRuns.$inferSelect) {
  return {
    id: row.id,
    jobKind: row.jobKind,
    trigger: row.trigger,
    status: row.status,
    fixtureFeedRunId: row.fixtureFeedRunId,
    liveLeagueCode: row.liveLeagueCode,
    liveResultStatus: row.liveResultStatus,
    historicalCampaignId: row.historicalCampaignId,
    historicalLeagueCode: row.historicalLeagueCode,
    historicalStage: row.historicalStage,
    candidateCount: row.candidateCount,
    predictionsCreated: row.predictionsCreated,
    predictionsReused: row.predictionsReused,
    predictionsFailed: row.predictionsFailed,
    observationsCaptured: row.observationsCaptured,
    observationsSettled: row.observationsSettled,
    observationsPending: row.observationsPending,
    summary: parseJson<Record<string, unknown>>(row.summaryJson, {}),
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
  };
}

function requireAutomationAdmin(actor: AdminActor) {
  if (actor.role !== "admin") {
    throw new ResearchAutomationHttpError(403, "RESEARCH_AUTOMATION_ADMIN_REQUIRED", "Araştırma otomasyonu yalnız yönetici rolüne açıktır.");
  }
}

function errorSummary(stage: string, error: unknown) {
  const message = error instanceof Error ? error.message.slice(0, 300) : "Bilinmeyen hata";
  const code = error instanceof ResearchAutomationHttpError
    ? error.code
    : error instanceof ModelLabValidationError && message.includes("known matches for both teams")
      ? "FORECAST_HISTORY_INSUFFICIENT"
      : error instanceof ModelLabValidationError
        ? "MODEL_VALIDATION_FAILED"
        : "UNEXPECTED_ERROR";
  return {
    stage,
    code,
    message,
  };
}

function normalizeAutomationError(error: unknown, fallbackCode: string, fallbackMessage: string) {
  if (error instanceof ResearchAutomationHttpError) return error;
  if (error instanceof Error && error.message.includes("binding")) {
    return new ResearchAutomationHttpError(503, "STORAGE_BINDING_UNAVAILABLE", "Kalıcı D1 veya R2 bağlantısı kullanılamıyor.");
  }
  return new ResearchAutomationHttpError(502, fallbackCode, fallbackMessage);
}

type SportMonksProvider = {
  kind: "sportmonks";
  key: string;
  token: string;
  upstreamUrl: string;
  upstreamUrls: string[];
  adapterVersion: typeof SPORTMONKS_ADAPTER_VERSION;
  maximumBytes: number;
};

function buildSportMonksProvider(token: string | null, nowIso: string): SportMonksProvider {
  if (!token) {
    throw new ResearchAutomationHttpError(
      503,
      "SPORTMONKS_NOT_CONFIGURED",
      "SportMonks API anahtarı sunucu ortamında yapılandırılmamış.",
    );
  }
  const upstreamUrls = buildSportMonksDateUrls(nowIso);
  return {
    kind: "sportmonks",
    key: "sportmonks-v11-minimal-team-history",
    token,
    upstreamUrl: upstreamUrls[0],
    upstreamUrls,
    adapterVersion: SPORTMONKS_ADAPTER_VERSION,
    maximumBytes: SPORTMONKS_MAX_BYTES,
  };
}

async function fetchSportMonksFixtures(provider: SportMonksProvider) {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Cache-Control": "no-cache",
    Authorization: sportMonksAuthorizationHeader(provider.token),
  };
  const fixtureMap = new Map<string, unknown>();
  const rateLimits = [] as ReturnType<typeof readSportMonksRateLimit>[];
  const account = await fetchSportMonksAccountCoverage(headers, rateLimits);
  let upstreamSubrequests = Object.keys(buildSportMonksAccountUrls()).length;
  const dailyCounts: Array<{ date: string; fixtures: number; pages: number }> = [];
  const historyCounts: Array<{ teamId: number; fixtures: number }> = [];
  const dailyFailures: Array<{ date: string; code: string; message: string }> = [];
  const historyFailures: Array<{ teamId: number; code: string; message: string }> = [];
  let downloadedBytes = 0;
  let response!: Response;
  for (const dateUrl of provider.upstreamUrls) {
    const countBeforeDate = fixtureMap.size;
    let pagesFetched = 0;
    const date = new URL(dateUrl).pathname.split("/").at(-1) ?? "unknown";
    try {
      for (let page = 1; page <= SPORTMONKS_MAX_PAGES_PER_DATE; page += 1) {
        upstreamSubrequests += 1;
        const pageResult = await fetchSportMonksPage(sportMonksPageUrl(dateUrl, page), headers, "SPORTMONKS_HTTP_ERROR");
        response = pageResult.response;
        rateLimits.push(pageResult.rateLimit);
        requireSportMonksPageBudget(pageResult.bytes.byteLength);
        downloadedBytes += pageResult.bytes.byteLength;
        pagesFetched = page;
        addSportMonksFixtures(fixtureMap, pageResult.data);
        if (!pageResult.hasMore) break;
        if (page === SPORTMONKS_MAX_PAGES_PER_DATE) {
          throw new ResearchAutomationHttpError(502, "SPORTMONKS_PAGE_BUDGET_EXCEEDED", "SportMonks günlük fikstürleri sekiz sayfalık güvenli çağrı bütçesini aştı.");
        }
      }
    } catch (error) {
      const failure = errorSummary(`fixtures:${date}`, error);
      dailyFailures.push({ date, code: failure.code, message: failure.message });
      console.error("sportmonks-daily-fetch-failed", JSON.stringify({ date, code: failure.code, message: failure.message }));
    }
    dailyCounts.push({
      date,
      fixtures: fixtureMap.size - countBeforeDate,
      pages: pagesFetched,
    });
  }
  const dailyFixtureCount = fixtureMap.size;
  if (dailyFixtureCount === 0) {
    if (dailyFailures.length === provider.upstreamUrls.length) {
      const firstFailure = dailyFailures[0];
      throw new ResearchAutomationHttpError(
        502,
        firstFailure?.code ?? "SPORTMONKS_HTTP_ERROR",
        firstFailure?.message ?? "SportMonks günlük fikstür endpoint'lerinin tamamına erişilemedi.",
      );
    }
    throw new ResearchAutomationHttpError(502, "SPORTMONKS_EMPTY_WINDOW", "SportMonks seçili 30 lig için dört günlük pencerede fikstür döndürmedi.");
  }

  const dailyFixtures = [...fixtureMap.values()];
  const activeTeamTargets = sportMonksPlanTeamTargets(dailyFixtures);
  const activeTeamIds = [...new Set(activeTeamTargets.map((target) => sportMonksTeamId(target.teamId)))];
  const knownHistoryRows = activeTeamIds.length
    ? await (await getDb()).select({
      leagueId: fixtures.leagueId,
      homeTeamId: fixtures.homeTeamId,
      awayTeamId: fixtures.awayTeamId,
    }).from(fixtures).where(and(
      eq(fixtures.status, "finished"),
      or(inArray(fixtures.homeTeamId, activeTeamIds), inArray(fixtures.awayTeamId, activeTeamIds)),
    ))
    : [];
  const knownHistoryByTeamLeague = new Map<string, number>();
  for (const row of knownHistoryRows) {
    for (const teamId of [row.homeTeamId, row.awayTeamId]) {
      const key = `${row.leagueId}:${teamId}`;
      knownHistoryByTeamLeague.set(key, (knownHistoryByTeamLeague.get(key) ?? 0) + 1);
    }
  }
  const historyTeamTargets = activeTeamTargets.filter((target) => (
    (knownHistoryByTeamLeague.get(`${target.leagueId}:${sportMonksTeamId(target.teamId)}`) ?? 0) < MIN_TEAM_HISTORY_MATCHES
  ));
  const availableHistoryBudget = Math.max(0, MAX_UPSTREAM_SUBREQUESTS_PER_RUN - upstreamSubrequests);
  const requestedHistoryTargets = historyTeamTargets.slice(0, Math.min(MAX_HISTORY_TEAM_REQUESTS_PER_RUN, availableHistoryBudget));
  const historyTeamsDeferred = historyTeamTargets.length - requestedHistoryTargets.length;
  const historyReferenceAt = new Date().toISOString();
  for (let index = 0; index < requestedHistoryTargets.length; index += 6) {
    const batch = requestedHistoryTargets.slice(index, index + 6);
    const results = await Promise.allSettled(batch.map(async (target) => ({
      target,
      result: await fetchSportMonksPage(
        buildSportMonksTeamHistoryUrl(historyReferenceAt, target.teamId, target.sportmonksLeagueId),
        headers,
        "SPORTMONKS_HISTORY_HTTP_ERROR",
      ),
    })));
    upstreamSubrequests += batch.length;
    for (let resultIndex = 0; resultIndex < results.length; resultIndex += 1) {
      const settled = results[resultIndex];
      const requestedTarget = batch[resultIndex];
      if (settled.status === "rejected") {
        const failure = errorSummary(`history:${requestedTarget.teamId}`, settled.reason);
        historyFailures.push({ teamId: requestedTarget.teamId, code: failure.code, message: failure.message });
        continue;
      }
      const { target, result } = settled.value;
      response = result.response;
      rateLimits.push(result.rateLimit);
      requireSportMonksPageBudget(result.bytes.byteLength);
      downloadedBytes += result.bytes.byteLength;
      const countBeforeTeam = fixtureMap.size;
      addSportMonksFixtures(fixtureMap, selectSportMonksTeamHistory(
        result.data,
        target.sportmonksLeagueId,
        MAX_HISTORY_FIXTURES_PER_TEAM,
      ));
      historyCounts.push({ teamId: target.teamId, fixtures: fixtureMap.size - countBeforeTeam });
    }
  }
  const historyFixtureCount = fixtureMap.size - dailyFixtureCount;

  const responseBuffer = new TextEncoder().encode(JSON.stringify({ data: [...fixtureMap.values()] })).buffer as ArrayBuffer;
  requireSportMonksByteBudget(responseBuffer.byteLength, provider.maximumBytes);
  const parsed = parseSportMonksFixtures({
    json: new TextDecoder("utf-8").decode(responseBuffer),
    capturedAt: new Date().toISOString(),
    upstreamUrl: provider.upstreamUrl,
  });
  const importedLeagueCount = new Set(parsed.envelopes.map((item) => item.payload.league.id)).size;
  const statisticRowCount = parsed.envelopes.reduce((total, item) => total + item.payload.stats.length, 0);
  const providerSummary = {
    schemaVersion: "sportmonks-provider-summary-v1",
    capturedAt: new Date().toISOString(),
    account,
    rateLimit: mergeSportMonksRateLimits(rateLimits),
    fetch: {
      dailyCounts,
      dailyFailures,
      activeTeamCount: activeTeamTargets.length,
      historyTeamsAlreadyReady: activeTeamTargets.length - historyTeamTargets.length,
      historyTeamsRequested: requestedHistoryTargets.length,
      historyTeamsDeferred,
      historyTeamCount: historyCounts.filter((item) => item.fixtures > 0).length,
      historyFixtureCount,
      historyFailures,
      downloadedBytes,
      mergedSnapshotBytes: responseBuffer.byteLength,
      rawFixtureCount: fixtureMap.size,
      importedFixtureCount: parsed.pilotRowCount,
      leagueCount: importedLeagueCount,
      statisticRowCount,
      ignoredFixtureCount: parsed.ignoredCount,
      upstreamSubrequests,
    },
    leagues: SPORTMONKS_PLAN_LEAGUES.map((league) => {
      const envelopes = parsed.envelopes.filter((item) => item.payload.league.id === league.id);
      const fixtureCount = envelopes.reduce((total, item) => total + item.payload.fixtures.length, 0);
      const finishedFixtureCount = envelopes.reduce((total, item) => total + item.payload.fixtures.filter((fixture) => fixture.status === "finished").length, 0);
      const statisticFixtureCount = new Set(envelopes.flatMap((item) => item.payload.stats.map((stat) => stat.fixtureId))).size;
      return {
        sportmonksId: league.sportmonksId,
        code: league.code,
        leagueId: league.id,
        name: league.name,
        licensed: account.status === "unavailable" ? null : account.licensedLeagueIds.includes(league.sportmonksId),
        fixtureCount,
        finishedFixtureCount,
        statisticFixtureCount,
        statisticsCoveragePercent: finishedFixtureCount > 0 ? Math.round((statisticFixtureCount / finishedFixtureCount) * 100) : 0,
      };
    }),
  };
  console.info("sportmonks-fetch-summary", JSON.stringify({
    dailyCounts,
    dailyFailureCount: dailyFailures.length,
    activeTeamCount: activeTeamTargets.length,
    historyTeamsAlreadyReady: activeTeamTargets.length - historyTeamTargets.length,
    historyTeamsRequested: requestedHistoryTargets.length,
    historyTeamsDeferred,
    historyTeamCount: historyCounts.filter((item) => item.fixtures > 0).length,
    historyFixtureCount,
    historyFailureCount: historyFailures.length,
    downloadedBytes,
    mergedSnapshotBytes: responseBuffer.byteLength,
    rawFixtureCount: fixtureMap.size,
    importedFixtureCount: parsed.pilotRowCount,
    leagueCount: importedLeagueCount,
    statisticRowCount,
    ignoredFixtureCount: parsed.ignoredCount,
    accountStatus: account.status,
    licensedLeagueCount: account.licensedLeagueIds.length,
    rateLimitRemaining: providerSummary.rateLimit.remaining,
    upstreamSubrequests,
  }));
  if (parsed.pilotRowCount === 0) {
    throw new ResearchAutomationHttpError(
      502,
      "SPORTMONKS_UNMAPPABLE_FIXTURES",
      `SportMonks ${fixtureMap.size} ham fikstür döndürdü ancak seçili 30 lig için işlenebilir maç bulunamadı.`,
    );
  }
  return {
    provider,
    response,
    responseBuffer,
    responseContentType: "application/json; charset=utf-8",
    upstreamEtag: null,
    upstreamLastModified: null,
    providerSummary,
  };
}

async function fetchSportMonksPage(url: string, headers: Record<string, string>, errorCode: string) {
  let response: Response;
  try {
    response = await fetch(url, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "";
    const subrequestLimit = /subrequest|too many requests/i.test(detail);
    throw new ResearchAutomationHttpError(
      502,
      subrequestLimit ? "SPORTMONKS_SUBREQUEST_BUDGET_EXCEEDED" : "SPORTMONKS_NETWORK_ERROR",
      subrequestLimit
        ? "SportMonks geçmiş çağrıları güvenli dış istek bütçesini aştı."
        : "SportMonks bağlantısı kurulamadı veya zaman aşımına uğradı.",
    );
  }
  if (!response.ok || response.status !== 200) {
    const code = response.status === 400
      ? "SPORTMONKS_REQUEST_INVALID"
      : response.status === 401
        ? "SPORTMONKS_AUTH_FAILED"
        : response.status === 403
          ? "SPORTMONKS_COVERAGE_DENIED"
          : response.status === 429
            ? "SPORTMONKS_RATE_LIMITED"
            : errorCode;
    throw new ResearchAutomationHttpError(502, code, `SportMonks HTTP ${response.status} yanıtı verdi.`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  let payload: { data?: unknown; pagination?: { has_more?: unknown } };
  try {
    payload = JSON.parse(new TextDecoder("utf-8").decode(bytes)) as typeof payload;
  } catch {
    throw new ResearchAutomationHttpError(502, "SPORTMONKS_INVALID_JSON", "SportMonks geçerli JSON döndürmedi.");
  }
  if (!Array.isArray(payload.data)) {
    throw new ResearchAutomationHttpError(502, "SPORTMONKS_INVALID_JSON", "SportMonks yanıtında fikstür listesi bulunamadı.");
  }
  return { response, bytes, data: payload.data, hasMore: payload.pagination?.has_more === true, rateLimit: readSportMonksRateLimit(response.headers) };
}

async function fetchSportMonksAccountCoverage(
  headers: Record<string, string>,
  rateLimits: ReturnType<typeof readSportMonksRateLimit>[],
) {
  const urls = buildSportMonksAccountUrls();
  const payloads: Partial<Record<keyof typeof urls, unknown>> = {};
  const errors: string[] = [];
  await Promise.all((Object.entries(urls) as Array<[keyof typeof urls, string]>).map(async ([kind, url]) => {
    try {
      const response = await fetch(url, { headers, redirect: "follow", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      rateLimits.push(readSportMonksRateLimit(response.headers));
      if (!response.ok) {
        errors.push(`${kind}:HTTP_${response.status}`);
        return;
      }
      payloads[kind] = await response.json();
    } catch {
      errors.push(`${kind}:FETCH_FAILED`);
    }
  }));
  return parseSportMonksAccountCoverage({
    leagues: payloads.leagues,
    resources: payloads.resources,
    enrichments: payloads.enrichments,
    checkedAt: new Date().toISOString(),
    errors,
  });
}

function addSportMonksFixtures(target: Map<string, unknown>, rows: unknown[]) {
  for (const item of rows) {
    const fixture = item as { id?: unknown; starting_at?: unknown; name?: unknown };
    target.set(String(fixture.id ?? `${fixture.starting_at}|${fixture.name}`), item);
  }
}

function requireSportMonksByteBudget(receivedBytes: number, maximumBytes: number) {
  if (receivedBytes > maximumBytes) {
    throw new ResearchAutomationHttpError(502, "FIXTURE_FEED_TOO_LARGE", "İşlenecek SportMonks snapshot'ı 32 MB güvenlik sınırını aşıyor.");
  }
}

function requireSportMonksPageBudget(receivedBytes: number) {
  if (receivedBytes > MAX_SPORTMONKS_PAGE_BYTES) {
    throw new ResearchAutomationHttpError(502, "SPORTMONKS_PAGE_TOO_LARGE", "Tek SportMonks API sayfası 8 MB güvenlik sınırını aşıyor.");
  }
}

async function getBucket(): Promise<R2Bucket> {
  const { env } = await import("cloudflare:workers");
  const bucket = (env as unknown as { BUCKET?: R2Bucket }).BUCKET;
  if (!bucket) throw new Error("Cloudflare R2 binding `BUCKET` is unavailable.");
  return bucket;
}

async function getResearchAutomationRuntime(): Promise<{ SPORTMONKS_API_TOKEN?: string }> {
  const { env } = await import("cloudflare:workers");
  return env as unknown as { SPORTMONKS_API_TOKEN?: string };
}

async function sha256(buffer: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function changedRows(value: unknown) {
  if (!value || typeof value !== "object") return 0;
  const meta = "meta" in value ? (value as { meta?: { changes?: number } }).meta : null;
  return Number(meta?.changes ?? 0);
}

function parseJson<T>(value: string, fallback: T): T {
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function fixtureFeedHistoryBackfillComplete(summaryJson: string) {
  const summary = parseJson<{ fetch?: { historyTeamsDeferred?: unknown } }>(summaryJson, {});
  return typeof summary.fetch?.historyTeamsDeferred === "number"
    && Number.isFinite(summary.fetch.historyTeamsDeferred)
    && summary.fetch.historyTeamsDeferred <= 0;
}

export type ResearchAutomationOverview = Awaited<ReturnType<typeof getResearchAutomationOverview>>;
