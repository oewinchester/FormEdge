import { and, desc, eq, lt } from "drizzle-orm";
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
  FOOTBALL_DATA_FIXTURE_FEED_ADAPTER_VERSION,
  FOOTBALL_DATA_FIXTURE_FEED_MAX_BYTES,
  FOOTBALL_DATA_FIXTURE_FEED_URL,
  parseFootballDataFixtureFeed,
} from "@/lib/football-data-fixture-feed";
import {
  FOOTBALL_DATA_ORG_ADAPTER_VERSION,
  FOOTBALL_DATA_ORG_MAX_BYTES,
  buildFootballDataOrgMatchesUrl,
  parseFootballDataOrgMatches,
} from "@/lib/football-data-org-live";
import {
  FOOTBALL_DATA_LIVE_SEASON,
  FOOTBALL_DATA_PILOT_LEAGUES,
  FootballDataSourceError,
} from "@/lib/football-data-source";
import {
  ResearchFeedHttpError,
  pullFootballDataSeason,
} from "@/lib/football-data-source-store";
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

const AUTOMATION_ACTIVE_KEY = "research-forward-shadow:1x2";
const FIXTURE_FEED_ACTIVE_KEY = "football-data:fixtures";
const FEED_WINDOW_MS = 10 * 60_000;
const FETCH_TIMEOUT_MS = 20_000;
const MAX_PREDICTIONS_PER_CYCLE = 6;
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
  const liveApiToken = runtime.FOOTBALL_DATA_ORG_API_TOKEN?.trim() || null;
  const upstreamUrl = liveApiToken ? buildFootballDataOrgMatchesUrl(nowIso) : FOOTBALL_DATA_FIXTURE_FEED_URL;
  const adapterVersion = liveApiToken ? FOOTBALL_DATA_ORG_ADAPTER_VERSION : FOOTBALL_DATA_FIXTURE_FEED_ADAPTER_VERSION;
  const maximumBytes = liveApiToken ? FOOTBALL_DATA_ORG_MAX_BYTES : FOOTBALL_DATA_FIXTURE_FEED_MAX_BYTES;
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
  const runId = `fdfix:${Math.floor(now.getTime() / FEED_WINDOW_MS)}`;
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

  const [previous] = await db.select().from(researchFixtureFeedRuns)
    .where(and(
      eq(researchFixtureFeedRuns.upstreamUrl, upstreamUrl),
      eq(researchFixtureFeedRuns.status, "imported"),
    ))
    .orderBy(desc(researchFixtureFeedRuns.startedAt)).limit(1);
  let responseStatus: number | null = null;
  let responseContentType: string | null = null;
  let upstreamEtag: string | null = null;
  let upstreamLastModified: string | null = null;
  let rawSnapshotKey: string | null = null;
  let rawChecksumSha256: string | null = null;
  let contentBytes = 0;

  try {
    const headers: Record<string, string> = {
      Accept: liveApiToken ? "application/json" : "text/csv,text/plain;q=0.9,*/*;q=0.1",
      "Cache-Control": "no-cache",
    };
    if (liveApiToken) headers["X-Auth-Token"] = liveApiToken;
    if (previous?.upstreamEtag) headers["If-None-Match"] = previous.upstreamEtag;
    const response = await fetch(upstreamUrl, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    responseStatus = response.status;
    responseContentType = response.headers.get("content-type");
    upstreamEtag = response.headers.get("etag");
    upstreamLastModified = response.headers.get("last-modified");
    if (response.status === 304 && previous) {
      await completeUnchangedFixtureFeed(runId, previous, {
        httpStatus: response.status,
        responseContentType,
        upstreamEtag: upstreamEtag ?? previous.upstreamEtag,
        upstreamLastModified: upstreamLastModified ?? previous.upstreamLastModified,
      });
      return { run: await loadPublicFixtureFeedRun(runId), reused: true };
    }
    if (!response.ok || response.status !== 200) {
      throw new ResearchAutomationHttpError(502, "FIXTURE_FEED_HTTP_ERROR", `Fikstür kaynağı HTTP ${response.status} yanıtı verdi.`);
    }
    const declaredBytes = Number(response.headers.get("content-length") ?? "0");
    if (declaredBytes > maximumBytes) {
      throw new ResearchAutomationHttpError(502, "FIXTURE_FEED_TOO_LARGE", "Fikstür CSV 5 MB güvenlik sınırını aşıyor.");
    }
    const responseBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(responseBuffer);
    contentBytes = bytes.byteLength;
    if (contentBytes > maximumBytes) {
      throw new ResearchAutomationHttpError(502, "FIXTURE_FEED_TOO_LARGE", "Fikstür CSV 5 MB güvenlik sınırını aşıyor.");
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
      });
      return { run: await loadPublicFixtureFeedRun(runId), reused: true };
    }

    const rawText = new TextDecoder("utf-8").decode(bytes);
    const parsed = liveApiToken
      ? parseFootballDataOrgMatches({ json: rawText, capturedAt: nowIso, upstreamUrl })
      : parseFootballDataFixtureFeed({ csv: rawText, capturedAt: nowIso });
    rawSnapshotKey = `research/football-data/fixtures/${rawChecksumSha256}.${liveApiToken ? "json" : "csv"}`;
    await (await getBucket()).put(rawSnapshotKey, bytes, {
      httpMetadata: { contentType: responseContentType || "text/csv; charset=utf-8" },
      customMetadata: {
        source: liveApiToken ? "football-data.org" : "football-data.co.uk",
        adapterVersion,
        fetchedAt: nowIso,
        checksumSha256: rawChecksumSha256,
      },
    });
    const ingestionRunIds: string[] = [];
    for (const envelope of parsed.envelopes) {
      const imported = await importFootballSnapshot(actor, envelope, {
        importFormat: "csv",
        externalIssues: parsed.qualityIssues,
        forceResearchOnlyReason: "Fikstür kaynağının ticari yeniden kullanım ve yayın kapıları doğrulanmadığı için kullanıcı önerisi üretilemez.",
      });
      ingestionRunIds.push(imported.runId);
    }
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
      leagueCount: parsed.envelopes.length,
      oddsSnapshotCount: parsed.oddsSnapshotCount,
      ingestionRunIdsJson: JSON.stringify(ingestionRunIds),
      completedAt: new Date().toISOString(),
    }).where(eq(researchFixtureFeedRuns.id, runId));
    return { run: await loadPublicFixtureFeedRun(runId), reused: false };
  } catch (error) {
    const normalized = normalizeAutomationError(error, "FIXTURE_FEED_FAILED", "Fikstür akışı güvenli biçimde alınamadı.");
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
      errors.push(errorSummary("fixture_feed", error));
    }

    liveLeagueCode = await selectNextLiveLeagueCode();
    if (liveLeagueCode) {
      try {
        const live = await pullFootballDataSeason(actor, {
          leagueCode: liveLeagueCode,
          seasonCode: FOOTBALL_DATA_LIVE_SEASON.code,
        });
        liveResultStatus = live.run?.status ?? "unknown";
      } catch (error) {
        const summary = errorSummary("live_results", error);
        liveResultStatus = `failed:${summary.code}`;
        errors.push(summary);
      }
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
    const status = infrastructureErrors.length ? "partial" as const : "completed" as const;
    const summary = {
      fixtureFeed: fixtureFeedRunId,
      liveLeagueCode,
      liveResultStatus,
      predictionLimit: MAX_PREDICTIONS_PER_CYCLE,
      predictionErrors: errors.filter((item) => item.stage.startsWith("prediction:")).slice(0, 20),
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
  const leagues = FOOTBALL_DATA_PILOT_LEAGUES.map((league) => {
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
      name: feedRows[0]?.adapterVersion === FOOTBALL_DATA_ORG_ADAPTER_VERSION ? "football-data.org v4 matches" : "Football-Data.co.uk fixture feed",
      url: feedRows[0]?.upstreamUrl ?? FOOTBALL_DATA_FIXTURE_FEED_URL,
      adapterVersion: feedRows[0]?.adapterVersion ?? FOOTBALL_DATA_FIXTURE_FEED_ADAPTER_VERSION,
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
      currentSeason: FOOTBALL_DATA_LIVE_SEASON.label,
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

async function selectNextLiveLeagueCode() {
  const db = await getDb();
  const rows = await db.select({
    leagueCode: researchAutomationRuns.liveLeagueCode,
    startedAt: researchAutomationRuns.startedAt,
  }).from(researchAutomationRuns)
    .where(eq(researchAutomationRuns.jobKind, "forward_shadow"))
    .orderBy(desc(researchAutomationRuns.startedAt)).limit(100);
  const latest = new Map<string, string>();
  for (const row of rows) if (row.leagueCode && !latest.has(row.leagueCode)) latest.set(row.leagueCode, row.startedAt);
  return [...FOOTBALL_DATA_PILOT_LEAGUES]
    .sort((first, second) => (latest.get(first.code) ?? "").localeCompare(latest.get(second.code) ?? "") || first.code.localeCompare(second.code))[0]?.code ?? null;
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
  const code = error instanceof ResearchAutomationHttpError || error instanceof ResearchFeedHttpError
    ? error.code
    : error instanceof FootballDataSourceError ? "SOURCE_CSV_INVALID" : "UNEXPECTED_ERROR";
  return {
    stage,
    code,
    message: error instanceof Error ? error.message.slice(0, 300) : "Bilinmeyen hata",
  };
}

function normalizeAutomationError(error: unknown, fallbackCode: string, fallbackMessage: string) {
  if (error instanceof ResearchAutomationHttpError) return error;
  if (error instanceof FootballDataSourceError) {
    return new ResearchAutomationHttpError(502, "SOURCE_CSV_INVALID", error.message);
  }
  if (error instanceof Error && error.message.includes("binding")) {
    return new ResearchAutomationHttpError(503, "STORAGE_BINDING_UNAVAILABLE", "Kalıcı D1 veya R2 bağlantısı kullanılamıyor.");
  }
  return new ResearchAutomationHttpError(502, fallbackCode, fallbackMessage);
}

async function getBucket(): Promise<R2Bucket> {
  const { env } = await import("cloudflare:workers");
  const bucket = (env as unknown as { BUCKET?: R2Bucket }).BUCKET;
  if (!bucket) throw new Error("Cloudflare R2 binding `BUCKET` is unavailable.");
  return bucket;
}

async function getResearchAutomationRuntime(): Promise<{
  FOOTBALL_DATA_ORG_API_TOKEN?: string;
}> {
  const { env } = await import("cloudflare:workers");
  return env as unknown as { FOOTBALL_DATA_ORG_API_TOKEN?: string };
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

export type ResearchAutomationOverview = Awaited<ReturnType<typeof getResearchAutomationOverview>>;
