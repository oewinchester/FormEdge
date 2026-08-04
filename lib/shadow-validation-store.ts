import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLogs,
  backtestPredictions,
  featureDatasetRuns,
  leagues,
  modelEvidenceRuns,
  researchSourceRuns,
  shadowValidationRuns,
  validationCampaigns,
} from "@/db/schema";
import type { AdminActor } from "@/lib/admin-data";
import { runBenchmarkSuite } from "@/lib/benchmark-suite-store";
import { runEvidenceSuite } from "@/lib/evidence-lab-store";
import {
  FOOTBALL_DATA_ADAPTER_VERSION,
  FOOTBALL_DATA_PILOT_LEAGUES,
  FOOTBALL_DATA_RESEARCH_SEASONS,
} from "@/lib/football-data-source";
import {
  pullFootballDataSeason,
  ResearchFeedHttpError,
} from "@/lib/football-data-source-store";
import { ModelLabValidationError } from "@/lib/model-lab";
import { createPointInTimeDataset } from "@/lib/point-in-time-dataset-store";
import { getResearchAutomationOverview } from "@/lib/research-automation-store";
import {
  SHADOW_VALIDATION_SCHEMA_VERSION,
  defaultShadowValidationThresholds,
  evaluateShadowValidation,
  type ShadowValidationBlocker,
} from "@/lib/shadow-validation";

const MARKET = "1X2" as const;
const EVIDENCE_SAMPLE_MINIMUM = 90;

export class ShadowValidationHttpError extends Error {
  constructor(
    public status: 400 | 403 | 404 | 409,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ShadowValidationHttpError";
  }
}

export async function getShadowValidationOverview(actor: AdminActor) {
  const db = await getDb();
  const [campaignRows, validationRows, sourceStates, automation] = await Promise.all([
    db.select().from(validationCampaigns).orderBy(desc(validationCampaigns.startedAt)).limit(60),
    db.select().from(shadowValidationRuns).orderBy(desc(shadowValidationRuns.createdAt)).limit(60),
    Promise.all(FOOTBALL_DATA_PILOT_LEAGUES.map((league) => getLeagueSourceState(league.code))),
    getResearchAutomationOverview(actor),
  ]);
  const validationByCampaign = new Map(validationRows.map((row) => [row.campaignId, publicValidation(row)]));
  const campaigns = campaignRows.map((row) => ({
    ...publicCampaign(row),
    validation: validationByCampaign.get(row.id) ?? null,
  }));
  const latestCampaignByLeague = new Map<string, typeof campaigns[number]>();
  const activeCampaignByLeague = new Map<string, typeof campaigns[number]>();
  for (const campaign of campaigns) {
    if (!latestCampaignByLeague.has(campaign.leagueId)) latestCampaignByLeague.set(campaign.leagueId, campaign);
    if (campaign.activeKey && !activeCampaignByLeague.has(campaign.leagueId)) activeCampaignByLeague.set(campaign.leagueId, campaign);
  }
  const pilots = sourceStates.map((source) => ({
    ...source,
    activeCampaign: activeCampaignByLeague.get(source.leagueId) ?? null,
    latestCampaign: latestCampaignByLeague.get(source.leagueId) ?? null,
  }));
  return {
    generatedAt: new Date().toISOString(),
    actor,
    totals: {
      pilots: pilots.length,
      sourceReady: pilots.filter((pilot) => pilot.ready).length,
      campaigns: campaignRows.length,
      completedCampaigns: campaignRows.filter((row) => row.status === "completed").length,
      stableSignals: validationRows.filter((row) => row.status === "stable").length,
      promotionEligible: validationRows.filter((row) => row.releaseEligibility === "forward_shadow_candidate").length,
    },
    policy: {
      schemaVersion: SHADOW_VALIDATION_SCHEMA_VERSION,
      market: MARKET,
      predictionHorizonHours: 48,
      minimumHistoryMatches: 5,
      minimumEvidenceSamples: EVIDENCE_SAMPLE_MINIMUM,
      thresholds: defaultShadowValidationThresholds,
      publicDatasetResearchOnly: true,
      commercialReuseVerified: false,
      revisionTimingVerified: false,
      forwardObserved: false,
      recommendationEligible: false,
    },
    pilots,
    campaigns,
    validations: validationRows.map(publicValidation),
    automation,
  };
}

export async function startShadowValidationCampaign(actor: AdminActor, leagueCode: unknown) {
  requireCampaignAdmin(actor);
  const league = resolvePilotLeague(leagueCode);
  const db = await getDb();
  const activeKey = `${league.id}:${MARKET}`;
  const [active] = await db.select().from(validationCampaigns)
    .where(eq(validationCampaigns.activeKey, activeKey))
    .limit(1);
  if (active) return { campaign: publicCampaign(active), validation: null, reused: true };

  await db.insert(leagues).values({
    id: league.id,
    countryCode: league.countryCode,
    name: league.name,
    tier: league.tier,
    coverageLevel: "basic",
    isActive: true,
  }).onConflictDoUpdate({
    target: leagues.id,
    set: { name: league.name, tier: league.tier, isActive: true, updatedAt: new Date().toISOString() },
  });

  const sourceState = await getLeagueSourceState(league.code);
  if (sourceState.ready && sourceState.fingerprint) {
    const [completed] = await db.select().from(validationCampaigns)
      .where(and(
        eq(validationCampaigns.leagueId, league.id),
        eq(validationCampaigns.sourceFingerprint, sourceState.fingerprint),
        eq(validationCampaigns.status, "completed"),
      ))
      .orderBy(desc(validationCampaigns.completedAt))
      .limit(1);
    if (completed) {
      const [validation] = await db.select().from(shadowValidationRuns)
        .where(eq(shadowValidationRuns.campaignId, completed.id))
        .limit(1);
      return {
        campaign: publicCampaign(completed),
        validation: validation ? publicValidation(validation) : null,
        reused: true,
      };
    }
  }

  const now = new Date().toISOString();
  const campaignId = crypto.randomUUID();
  const inserted = await db.insert(validationCampaigns).values({
    id: campaignId,
    activeKey,
    leagueId: league.id,
    leagueCode: league.code,
    leagueLabel: league.name,
    market: MARKET,
    status: "queued",
    currentStage: "source",
    sourceFingerprint: sourceState.fingerprint,
    sourceStateJson: canonicalJson(sourceState),
    stageSummaryJson: canonicalJson({ message: "Araştırma doğrulama kampanyası sıraya alındı." }),
    blockersJson: "[]",
    researchOnly: true,
    recommendationEligible: false,
    createdByEmail: actor.email,
    lastAdvancedByEmail: actor.email,
    startedAt: now,
    updatedAt: now,
  }).onConflictDoNothing();
  if (changedRows(inserted) === 0) {
    const [raced] = await db.select().from(validationCampaigns)
      .where(eq(validationCampaigns.activeKey, activeKey))
      .limit(1);
    if (raced) return { campaign: publicCampaign(raced), validation: null, reused: true };
    throw new ShadowValidationHttpError(409, "CAMPAIGN_START_CONFLICT", "Kampanya aynı anda başka bir istek tarafından başlatıldı.");
  }
  await db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    actorEmail: actor.email,
    action: "shadow.campaign.started",
    entityType: "validation_campaign",
    entityId: campaignId,
    detailsJson: canonicalJson({ leagueCode: league.code, leagueId: league.id, market: MARKET, researchOnly: true }),
  });
  const [campaign] = await db.select().from(validationCampaigns).where(eq(validationCampaigns.id, campaignId)).limit(1);
  return { campaign: publicCampaign(campaign), validation: null, reused: false };
}

export async function advanceShadowValidationCampaign(actor: AdminActor, campaignId: unknown) {
  requireCampaignAdmin(actor);
  if (typeof campaignId !== "string" || !campaignId.trim()) {
    throw new ShadowValidationHttpError(400, "CAMPAIGN_ID_REQUIRED", "campaignId gereklidir.");
  }
  const db = await getDb();
  const [campaign] = await db.select().from(validationCampaigns)
    .where(eq(validationCampaigns.id, campaignId.trim()))
    .limit(1);
  if (!campaign) throw new ShadowValidationHttpError(404, "CAMPAIGN_NOT_FOUND", "Doğrulama kampanyası bulunamadı.");
  if (campaign.status === "completed") {
    const [validation] = await db.select().from(shadowValidationRuns)
      .where(eq(shadowValidationRuns.campaignId, campaign.id))
      .limit(1);
    return {
      campaign: publicCampaign(campaign),
      validation: validation ? publicValidation(validation) : null,
      stageCompleted: "done" as const,
      done: true,
      reused: true,
    };
  }
  if (campaign.status === "failed") {
    throw new ShadowValidationHttpError(409, "CAMPAIGN_FAILED", "Bu kampanya başarısız oldu; kaynak durumu düzeltildikten sonra yeni kampanya başlatın.");
  }

  await db.update(validationCampaigns).set({
    status: "running",
    lastAdvancedByEmail: actor.email,
    errorCode: null,
    errorMessage: null,
    updatedAt: new Date().toISOString(),
  }).where(eq(validationCampaigns.id, campaign.id));

  try {
    if (campaign.currentStage === "source") return await advanceSourceStage(actor, campaign);
    if (campaign.currentStage === "dataset") return await advanceDatasetStage(actor, campaign);
    if (campaign.currentStage === "benchmarks") return await advanceBenchmarkStage(actor, campaign);
    if (campaign.currentStage === "evidence") return await advanceEvidenceStage(actor, campaign);
    if (campaign.currentStage === "shadow") return await advanceShadowStage(actor, campaign);
    throw new ShadowValidationHttpError(409, "CAMPAIGN_STAGE_INVALID", "Kampanya aşaması ilerletilemiyor.");
  } catch (error) {
    const normalized = normalizeCampaignError(error);
    const failedAt = new Date().toISOString();
    try {
      await db.batch([
        db.update(validationCampaigns).set({
          activeKey: null,
          status: "failed",
          errorCode: normalized.code,
          errorMessage: normalized.message.slice(0, 500),
          completedAt: failedAt,
          updatedAt: failedAt,
        }).where(eq(validationCampaigns.id, campaign.id)),
        db.insert(auditLogs).values({
          id: crypto.randomUUID(),
          actorEmail: actor.email,
          action: "shadow.campaign.failed",
          entityType: "validation_campaign",
          entityId: campaign.id,
          detailsJson: canonicalJson({ stage: campaign.currentStage, code: normalized.code, message: normalized.message }),
        }),
      ]);
    } catch {
      // Preserve the original stage failure.
    }
    throw error;
  }
}

async function advanceSourceStage(actor: AdminActor, campaign: typeof validationCampaigns.$inferSelect) {
  let sourceState = await getLeagueSourceState(campaign.leagueCode);
  let pulled: { leagueCode: string; seasonCode: string; status: string; reused: boolean } | null = null;
  const next = sourceState.seasons.find((season) => !season.ready);
  if (next) {
    const result = await pullFootballDataSeason(actor, {
      leagueCode: campaign.leagueCode,
      seasonCode: next.code,
    });
    pulled = {
      leagueCode: campaign.leagueCode,
      seasonCode: next.code,
      status: result.run?.status ?? "unknown",
      reused: result.reused,
    };
    sourceState = await getLeagueSourceState(campaign.leagueCode);
  }
  const nextStage = sourceState.ready ? "dataset" as const : "source" as const;
  const now = new Date().toISOString();
  const db = await getDb();
  await db.batch([
    db.update(validationCampaigns).set({
      status: "running",
      currentStage: nextStage,
      sourceFingerprint: sourceState.fingerprint,
      sourceStateJson: canonicalJson(sourceState),
      stageSummaryJson: canonicalJson({
        message: sourceState.ready ? "Beş araştırma sezonu hazır; dataset aşaması açıldı." : "Bir kaynak sezonu işlendi; sıra kontrollü biçimde devam ediyor.",
        pulled,
        readySeasonCount: sourceState.readySeasonCount,
        targetSeasonCount: sourceState.seasons.length,
      }),
      lastAdvancedByEmail: actor.email,
      updatedAt: now,
    }).where(eq(validationCampaigns.id, campaign.id)),
    auditStage(db, actor, campaign.id, "source", { pulled, ready: sourceState.ready, fingerprint: sourceState.fingerprint }),
  ]);
  return stageResponse(campaign.id, "source", false);
}

async function advanceDatasetStage(actor: AdminActor, campaign: typeof validationCampaigns.$inferSelect) {
  const result = await createPointInTimeDataset(actor, {
    name: `${campaign.leagueLabel} · CP17C point-in-time`,
    leagueId: campaign.leagueId,
    predictionHorizonHours: 48,
    minimumHistoryMatches: 5,
  });
  const now = new Date().toISOString();
  const db = await getDb();
  await db.batch([
    db.update(validationCampaigns).set({
      datasetRunId: result.dataset.id,
      currentStage: "benchmarks",
      stageSummaryJson: canonicalJson({
        message: result.reused ? "Aynı değişmez dataset yeniden kullanıldı." : "Değişmez zaman-noktalı dataset üretildi.",
        datasetRunId: result.dataset.id,
        sampleCount: result.dataset.eligibleSampleCount,
        leakageViolationCount: result.dataset.leakageViolationCount,
        checksumSha256: result.dataset.datasetChecksumSha256,
        reused: result.reused,
      }),
      lastAdvancedByEmail: actor.email,
      updatedAt: now,
    }).where(eq(validationCampaigns.id, campaign.id)),
    auditStage(db, actor, campaign.id, "dataset", { datasetRunId: result.dataset.id, reused: result.reused }),
  ]);
  return stageResponse(campaign.id, "dataset", false);
}

async function advanceBenchmarkStage(actor: AdminActor, campaign: typeof validationCampaigns.$inferSelect) {
  if (!campaign.datasetRunId) throw new ShadowValidationHttpError(409, "DATASET_LINK_MISSING", "Benchmark aşaması için dataset bağlantısı eksik.");
  const suite = await runBenchmarkSuite(actor, campaign.datasetRunId);
  const winner = suite.runs.find((run) => run.modelCode === suite.winnerModelCode);
  if (!winner) throw new ShadowValidationHttpError(409, "BENCHMARK_WINNER_MISSING", "Dört model karşılaştırmasında lider koşu çözülemedi.");
  const now = new Date().toISOString();
  const db = await getDb();
  await db.batch([
    db.update(validationCampaigns).set({
      selectedBacktestRunId: winner.runId,
      selectedModelCode: winner.modelCode,
      currentStage: "evidence",
      stageSummaryJson: canonicalJson({
        message: "Dört model aynı walk-forward pencerelerinde karşılaştırıldı.",
        winnerModelCode: winner.modelCode,
        winnerBacktestRunId: winner.runId,
        winnerMetrics: winner.metrics,
        runIds: suite.runs.map((run) => ({ modelCode: run.modelCode, runId: run.runId })),
        reusedRunCount: suite.reusedRunCount,
      }),
      lastAdvancedByEmail: actor.email,
      updatedAt: now,
    }).where(eq(validationCampaigns.id, campaign.id)),
    auditStage(db, actor, campaign.id, "benchmarks", { winnerModelCode: winner.modelCode, winnerBacktestRunId: winner.runId }),
  ]);
  return stageResponse(campaign.id, "benchmarks", false);
}

async function advanceEvidenceStage(actor: AdminActor, campaign: typeof validationCampaigns.$inferSelect) {
  if (!campaign.datasetRunId) throw new ShadowValidationHttpError(409, "DATASET_LINK_MISSING", "Kanıt aşaması için dataset bağlantısı eksik.");
  const db = await getDb();
  const [dataset] = await db.select().from(featureDatasetRuns)
    .where(eq(featureDatasetRuns.id, campaign.datasetRunId))
    .limit(1);
  if (!dataset) throw new ShadowValidationHttpError(409, "DATASET_NOT_FOUND", "Kampanyanın değişmez dataset kaydı bulunamadı.");
  let evidenceRunId: string | null = null;
  let blockers = parseJson<ShadowValidationBlocker[]>(campaign.blockersJson, []);
  let summary: Record<string, unknown>;
  if (dataset.eligibleSampleCount >= EVIDENCE_SAMPLE_MINIMUM) {
    const result = await runEvidenceSuite(actor, dataset.id);
    evidenceRunId = result.evidence.id;
    summary = {
      message: result.reused ? "Değişmez kanıt koşusu yeniden kullanıldı." : "Ablation, kalibrasyon ve dokunulmamış holdout koşusu tamamlandı.",
      evidenceRunId,
      evidenceStatus: result.evidence.status,
      reused: result.reused,
    };
  } else {
    blockers = mergeBlockers(blockers, [{
      code: "EVIDENCE_SAMPLE_MINIMUM_NOT_MET",
      message: `Dataset ${dataset.eligibleSampleCount} örnek içeriyor; kanıt koşusu için en az ${EVIDENCE_SAMPLE_MINIMUM} gerekir.`,
    }]);
    summary = {
      message: "Dataset benchmark için yeterli, tam kanıt koşusu için yetersiz; gölge-readiness ölçümü eksik kanıtla devam edecek.",
      eligibleSampleCount: dataset.eligibleSampleCount,
      minimumEvidenceSamples: EVIDENCE_SAMPLE_MINIMUM,
    };
  }
  const now = new Date().toISOString();
  await db.batch([
    db.update(validationCampaigns).set({
      evidenceRunId,
      currentStage: "shadow",
      stageSummaryJson: canonicalJson(summary),
      blockersJson: canonicalJson(blockers),
      lastAdvancedByEmail: actor.email,
      updatedAt: now,
    }).where(eq(validationCampaigns.id, campaign.id)),
    auditStage(db, actor, campaign.id, "evidence", { evidenceRunId, sampleCount: dataset.eligibleSampleCount }),
  ]);
  return stageResponse(campaign.id, "evidence", false);
}

async function advanceShadowStage(actor: AdminActor, campaign: typeof validationCampaigns.$inferSelect) {
  if (!campaign.datasetRunId || !campaign.selectedBacktestRunId || !campaign.selectedModelCode) {
    throw new ShadowValidationHttpError(409, "SHADOW_INPUT_LINK_MISSING", "Stabilite ölçümü için dataset, model ve backtest bağlantıları zorunludur.");
  }
  const db = await getDb();
  const [existing] = await db.select().from(shadowValidationRuns)
    .where(eq(shadowValidationRuns.campaignId, campaign.id))
    .limit(1);
  if (existing) {
    await markCampaignDone(actor, campaign, publicValidation(existing).blockers);
    return stageResponse(campaign.id, "shadow", true, publicValidation(existing), true);
  }
  const [predictionRows, evidenceRows, datasetRows] = await Promise.all([
    db.select().from(backtestPredictions)
      .where(eq(backtestPredictions.backtestRunId, campaign.selectedBacktestRunId))
      .orderBy(backtestPredictions.kickoffAt),
    campaign.evidenceRunId
      ? db.select().from(modelEvidenceRuns).where(eq(modelEvidenceRuns.id, campaign.evidenceRunId)).limit(1)
      : Promise.resolve([]),
    db.select().from(featureDatasetRuns).where(eq(featureDatasetRuns.id, campaign.datasetRunId)).limit(1),
  ]);
  const evidence = evidenceRows[0] ?? null;
  const dataset = datasetRows[0];
  if (!dataset) throw new ShadowValidationHttpError(409, "DATASET_NOT_FOUND", "Stabilite ölçümünün dataset kaydı bulunamadı.");
  const result = evaluateShadowValidation({
    observations: predictionRows.map((row) => ({
      fixtureId: row.fixtureKey,
      predictionAt: row.predictionAt,
      kickoffAt: row.kickoffAt,
      featureCutoffAt: row.featureCutoffAt,
      resultKnownAt: row.resultKnownAt ?? row.kickoffAt,
      actualOutcome: row.actualOutcome,
      probabilities: {
        home: row.probabilityHome,
        draw: row.probabilityDraw,
        away: row.probabilityAway,
      },
      dataCompleteness: row.dataCompleteness,
    })),
    researchOnly: true,
    forwardObserved: false,
    commercialReuseVerified: false,
    revisionTimingVerified: false,
    evidenceCompleted: evidence?.status === "completed",
    evidenceStatus: evidence?.evidenceStatus,
  });
  const inheritedBlockers = parseJson<ShadowValidationBlocker[]>(campaign.blockersJson, []);
  const blockers = mergeBlockers(inheritedBlockers, result.blockers);
  const resultChecksumSha256 = await sha256(canonicalJson({
    campaignId: campaign.id,
    datasetChecksumSha256: dataset.datasetChecksumSha256,
    backtestRunId: campaign.selectedBacktestRunId,
    evidenceRunId: campaign.evidenceRunId,
    result: { ...result, blockers },
  }));
  const validationId = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.batch([
    db.insert(shadowValidationRuns).values({
      id: validationId,
      campaignId: campaign.id,
      datasetRunId: campaign.datasetRunId,
      backtestRunId: campaign.selectedBacktestRunId,
      evidenceRunId: campaign.evidenceRunId,
      leagueId: campaign.leagueId,
      leagueLabel: campaign.leagueLabel,
      market: MARKET,
      modelCode: campaign.selectedModelCode,
      status: result.status,
      releaseEligibility: "blocked",
      researchOnly: true,
      forwardObserved: false,
      sampleCount: result.evaluatedSampleCount,
      leakageViolationCount: result.leakageViolationCount,
      averageDataCompleteness: result.averageDataCompleteness,
      earlyWindowJson: canonicalJson(result.earlyWindow),
      lateWindowJson: canonicalJson(result.lateWindow),
      driftJson: canonicalJson(result.drift),
      thresholdsJson: canonicalJson(result.thresholds),
      blockersJson: canonicalJson(blockers),
      resultChecksumSha256,
      createdByEmail: actor.email,
    }),
    db.update(validationCampaigns).set({
      activeKey: null,
      status: "completed",
      currentStage: "done",
      blockersJson: canonicalJson(blockers),
      stageSummaryJson: canonicalJson({
        message: "Erken/geç dönem araştırma stabilitesi ölçüldü; ileri-zaman ve lisans kanıtı olmadığı için yayın kapısı kapalı.",
        validationId,
        status: result.status,
        releaseEligibility: "blocked",
        resultChecksumSha256,
      }),
      recommendationEligible: false,
      lastAdvancedByEmail: actor.email,
      completedAt: now,
      updatedAt: now,
    }).where(eq(validationCampaigns.id, campaign.id)),
    auditStage(db, actor, campaign.id, "shadow", {
      validationId,
      status: result.status,
      releaseEligibility: "blocked",
      blockerCodes: blockers.map((row) => row.code),
      resultChecksumSha256,
    }),
  ]);
  const [validation] = await db.select().from(shadowValidationRuns)
    .where(eq(shadowValidationRuns.id, validationId))
    .limit(1);
  return stageResponse(campaign.id, "shadow", true, publicValidation(validation));
}

async function getLeagueSourceState(leagueCode: string) {
  const league = resolvePilotLeague(leagueCode);
  const db = await getDb();
  const rows = await db.select().from(researchSourceRuns)
    .where(eq(researchSourceRuns.leagueCode, league.code))
    .orderBy(desc(researchSourceRuns.startedAt))
    .limit(100);
  const seasons = FOOTBALL_DATA_RESEARCH_SEASONS.map((season) => {
    const latest = rows.find((row) => row.seasonCode === season.code) ?? null;
    const successful = rows.find((row) => (
      row.seasonCode === season.code
      && (row.status === "imported" || row.status === "unchanged")
      && Boolean(row.rawChecksumSha256)
    )) ?? null;
    return {
      ...season,
      ready: Boolean(successful),
      status: successful ? "ready" as const : latest?.status ?? "not_started" as const,
      checksumSha256: successful?.rawChecksumSha256 ?? null,
      sourceRowCount: successful?.sourceRowCount ?? 0,
      completedAt: successful?.completedAt ?? null,
      latestAttemptStatus: latest?.status ?? "not_started" as const,
      latestErrorCode: latest?.errorCode ?? null,
    };
  });
  const ready = seasons.every((season) => season.ready);
  const fingerprint = ready
    ? await sha256(canonicalJson({
      adapterVersion: FOOTBALL_DATA_ADAPTER_VERSION,
      leagueCode: league.code,
      seasons: seasons.map((season) => ({ code: season.code, checksumSha256: season.checksumSha256 })),
    }))
    : null;
  return {
    leagueCode: league.code,
    leagueId: league.id,
    leagueLabel: league.name,
    countryCode: league.countryCode,
    tier: league.tier,
    ready,
    readySeasonCount: seasons.filter((season) => season.ready).length,
    fingerprint,
    researchOnly: true,
    revisionTimingVerified: false,
    commercialReuseVerified: false,
    seasons,
  };
}

function resolvePilotLeague(value: unknown) {
  if (typeof value !== "string") {
    throw new ShadowValidationHttpError(400, "LEAGUE_CODE_REQUIRED", "leagueCode gereklidir.");
  }
  const league = FOOTBALL_DATA_PILOT_LEAGUES.find((item) => item.code === value.trim());
  if (!league) throw new ShadowValidationHttpError(400, "LEAGUE_NOT_ALLOWLISTED", "Yalnız tanımlı pilot ligler doğrulama kuyruğuna alınabilir.");
  return league;
}

function requireCampaignAdmin(actor: AdminActor) {
  if (actor.role !== "admin") {
    throw new ShadowValidationHttpError(403, "SHADOW_ADMIN_REQUIRED", "Doğrulama kampanyalarını yalnız yönetici rolü çalıştırabilir.");
  }
}

async function stageResponse(
  campaignId: string,
  stageCompleted: "source" | "dataset" | "benchmarks" | "evidence" | "shadow",
  done: boolean,
  validation: ReturnType<typeof publicValidation> | null = null,
  reused = false,
) {
  const db = await getDb();
  const [campaign] = await db.select().from(validationCampaigns)
    .where(eq(validationCampaigns.id, campaignId))
    .limit(1);
  return { campaign: publicCampaign(campaign), validation, stageCompleted, done, reused };
}

async function markCampaignDone(
  actor: AdminActor,
  campaign: typeof validationCampaigns.$inferSelect,
  blockers: ShadowValidationBlocker[],
) {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.update(validationCampaigns).set({
    activeKey: null,
    status: "completed",
    currentStage: "done",
    blockersJson: canonicalJson(blockers),
    recommendationEligible: false,
    lastAdvancedByEmail: actor.email,
    completedAt: campaign.completedAt ?? now,
    updatedAt: now,
  }).where(eq(validationCampaigns.id, campaign.id));
}

function auditStage(
  db: Awaited<ReturnType<typeof getDb>>,
  actor: AdminActor,
  campaignId: string,
  stage: string,
  details: Record<string, unknown>,
) {
  return db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    actorEmail: actor.email,
    action: `shadow.stage.${stage}.completed`,
    entityType: "validation_campaign",
    entityId: campaignId,
    detailsJson: canonicalJson(details),
  });
}

function publicCampaign(row: typeof validationCampaigns.$inferSelect | undefined) {
  if (!row) throw new ShadowValidationHttpError(404, "CAMPAIGN_NOT_FOUND", "Doğrulama kampanyası bulunamadı.");
  return {
    id: row.id,
    activeKey: row.activeKey,
    leagueId: row.leagueId,
    leagueCode: row.leagueCode,
    leagueLabel: row.leagueLabel,
    market: row.market,
    status: row.status,
    currentStage: row.currentStage,
    sourceFingerprint: row.sourceFingerprint,
    sourceState: parseJson<Record<string, unknown>>(row.sourceStateJson, {}),
    datasetRunId: row.datasetRunId,
    evidenceRunId: row.evidenceRunId,
    selectedBacktestRunId: row.selectedBacktestRunId,
    selectedModelCode: row.selectedModelCode,
    stageSummary: parseJson<Record<string, unknown>>(row.stageSummaryJson, {}),
    blockers: parseJson<ShadowValidationBlocker[]>(row.blockersJson, []),
    researchOnly: row.researchOnly,
    recommendationEligible: row.recommendationEligible,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    updatedAt: row.updatedAt,
  };
}

function publicValidation(row: typeof shadowValidationRuns.$inferSelect | undefined) {
  if (!row) throw new ShadowValidationHttpError(404, "VALIDATION_NOT_FOUND", "Stabilite doğrulama kaydı bulunamadı.");
  return {
    id: row.id,
    campaignId: row.campaignId,
    datasetRunId: row.datasetRunId,
    backtestRunId: row.backtestRunId,
    evidenceRunId: row.evidenceRunId,
    leagueId: row.leagueId,
    leagueLabel: row.leagueLabel,
    market: row.market,
    modelCode: row.modelCode,
    status: row.status,
    releaseEligibility: row.releaseEligibility,
    researchOnly: row.researchOnly,
    forwardObserved: row.forwardObserved,
    sampleCount: row.sampleCount,
    leakageViolationCount: row.leakageViolationCount,
    averageDataCompleteness: row.averageDataCompleteness,
    earlyWindow: parseJson<Record<string, unknown>>(row.earlyWindowJson, {}),
    lateWindow: parseJson<Record<string, unknown>>(row.lateWindowJson, {}),
    drift: parseJson<Record<string, unknown>>(row.driftJson, {}),
    thresholds: parseJson<Record<string, unknown>>(row.thresholdsJson, {}),
    blockers: parseJson<ShadowValidationBlocker[]>(row.blockersJson, []),
    resultChecksumSha256: row.resultChecksumSha256,
    createdAt: row.createdAt,
  };
}

function normalizeCampaignError(error: unknown) {
  if (error instanceof ShadowValidationHttpError) return error;
  if (error instanceof ResearchFeedHttpError) {
    return new ShadowValidationHttpError(
      error.status === 403 ? 403 : error.status === 409 ? 409 : 400,
      error.code,
      error.message,
    );
  }
  if (error instanceof ModelLabValidationError) {
    return new ShadowValidationHttpError(400, "MODEL_PIPELINE_VALIDATION_FAILED", error.message);
  }
  return new ShadowValidationHttpError(409, "CAMPAIGN_STAGE_FAILED", error instanceof Error ? error.message : "Kampanya aşaması tamamlanamadı.");
}

function mergeBlockers(first: ShadowValidationBlocker[], second: ShadowValidationBlocker[]) {
  const merged = new Map(first.map((row) => [row.code, row]));
  for (const row of second) merged.set(row.code, row);
  return [...merged.values()];
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function canonicalJson(value: unknown): string {
  if (value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([first], [second]) => first.localeCompare(second));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function changedRows(value: unknown) {
  if (!value || typeof value !== "object") return 0;
  const meta = "meta" in value ? (value as { meta?: { changes?: number } }).meta : null;
  return Number(meta?.changes ?? 0);
}

export type ShadowValidationOverview = Awaited<ReturnType<typeof getShadowValidationOverview>>;
