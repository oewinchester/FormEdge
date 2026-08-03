import { and, count, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLogs,
  featureDatasetRuns,
  featureDatasetSamples,
  fixtures,
  leagues,
  oddsSnapshots,
  teamMatchStats,
} from "@/db/schema";
import type { AdminActor } from "@/lib/admin-data";
import { ModelLabValidationError } from "@/lib/model-lab";
import {
  DATASET_BUILDER_VERSION,
  buildPointInTimeDataset,
  canonicalDatasetJson,
  type PointInTimeDatasetConfig,
} from "@/lib/point-in-time-dataset";

const MINIMUM_PERSISTED_SAMPLES = 20;
const DEFAULT_RESULT_AVAILABILITY_HOURS = 4;

export type CreatePointInTimeDatasetInput = {
  name?: string;
  leagueId: string;
  predictionHorizonHours: number;
  minimumHistoryMatches: number;
  resultAvailabilityHours?: number;
};

export type FeatureDatasetSummary = {
  id: string;
  name: string;
  leagueId: string;
  leagueLabel: string;
  market: "1X2";
  status: "building" | "completed" | "failed";
  predictionHorizonHours: number;
  minimumHistoryMatches: number;
  resultAvailabilityHours: number;
  sourceFixtureCount: number;
  eligibleSampleCount: number;
  rejectedSampleCount: number;
  averageDataCompleteness: number;
  oddsCoverage: number;
  featureSchemaVersion: string;
  benchmarkSchemaVersion: string;
  builderVersion: string;
  datasetChecksumSha256: string;
  leakageViolationCount: number;
  availabilityAssumption: string;
  createdByEmail: string;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
};

export async function getPointInTimeDatasetOverview() {
  const db = await getDb();
  const [
    [{ total: datasetCount }],
    recentRows,
    leagueRows,
    statCoverageRows,
    oddsCoverageRows,
  ] = await Promise.all([
    db.select({ total: count() }).from(featureDatasetRuns),
    db.select().from(featureDatasetRuns).orderBy(desc(featureDatasetRuns.startedAt)).limit(20),
    db.select({
      leagueId: leagues.id,
      leagueLabel: leagues.name,
      countryCode: leagues.countryCode,
      coverageLevel: leagues.coverageLevel,
      fixtureCount: count(fixtures.id),
      finishedFixtureCount: sql<number>`sum(case when ${fixtures.status} = 'finished' then 1 else 0 end)`,
      earliestKickoffAt: sql<string | null>`min(case when ${fixtures.status} = 'finished' then ${fixtures.kickoffAt} end)`,
      latestKickoffAt: sql<string | null>`max(case when ${fixtures.status} = 'finished' then ${fixtures.kickoffAt} end)`,
    }).from(leagues)
      .leftJoin(fixtures, eq(fixtures.leagueId, leagues.id))
      .where(eq(leagues.isActive, true))
      .groupBy(leagues.id),
    db.select({
      leagueId: fixtures.leagueId,
      fixtureCount: sql<number>`count(distinct ${teamMatchStats.fixtureId})`,
    }).from(teamMatchStats)
      .innerJoin(fixtures, eq(teamMatchStats.fixtureId, fixtures.id))
      .where(eq(fixtures.status, "finished"))
      .groupBy(fixtures.leagueId),
    db.select({
      leagueId: fixtures.leagueId,
      fixtureCount: sql<number>`count(distinct ${oddsSnapshots.fixtureId})`,
    }).from(oddsSnapshots)
      .innerJoin(fixtures, eq(oddsSnapshots.fixtureId, fixtures.id))
      .where(and(eq(fixtures.status, "finished"), eq(oddsSnapshots.market, "1X2")))
      .groupBy(fixtures.leagueId),
  ]);

  const statsByLeague = new Map(statCoverageRows.map((row) => [row.leagueId, Number(row.fixtureCount)]));
  const oddsByLeague = new Map(oddsCoverageRows.map((row) => [row.leagueId, Number(row.fixtureCount)]));
  const readiness = leagueRows.map((row) => {
    const finishedFixtureCount = Number(row.finishedFixtureCount ?? 0);
    const statFixtureCount = statsByLeague.get(row.leagueId) ?? 0;
    const oddsFixtureCount = oddsByLeague.get(row.leagueId) ?? 0;
    return {
      leagueId: row.leagueId,
      leagueLabel: row.leagueLabel,
      countryCode: row.countryCode,
      coverageLevel: row.coverageLevel,
      fixtureCount: Number(row.fixtureCount),
      finishedFixtureCount,
      statFixtureCount,
      oddsFixtureCount,
      statFixtureCoverage: finishedFixtureCount ? round(statFixtureCount / finishedFixtureCount, 6) : 0,
      oddsFixtureCoverage: finishedFixtureCount ? round(oddsFixtureCount / finishedFixtureCount, 6) : 0,
      earliestKickoffAt: row.earliestKickoffAt,
      latestKickoffAt: row.latestKickoffAt,
      canAttemptBuild: finishedFixtureCount >= MINIMUM_PERSISTED_SAMPLES,
    };
  }).sort((first, second) => (
    Number(second.canAttemptBuild) - Number(first.canAttemptBuild)
    || second.finishedFixtureCount - first.finishedFixtureCount
    || first.leagueLabel.localeCompare(second.leagueLabel)
  ));

  return {
    count: datasetCount,
    datasets: recentRows.map(toDatasetSummary),
    readiness,
    policy: {
      minimumPersistedSamples: MINIMUM_PERSISTED_SAMPLES,
      defaultResultAvailabilityHours: DEFAULT_RESULT_AVAILABILITY_HOURS,
      statsAvailabilityPolicy: "fixture_end_plus_buffer" as const,
      researchOnly: true,
    },
  };
}

export async function createPointInTimeDataset(
  actor: AdminActor,
  input: CreatePointInTimeDatasetInput,
) {
  if (!input || typeof input !== "object") {
    throw new ModelLabValidationError("Dataset build input is required.");
  }
  const db = await getDb();
  const [league] = await db.select({ id: leagues.id, name: leagues.name })
    .from(leagues)
    .where(and(eq(leagues.id, input.leagueId), eq(leagues.isActive, true)))
    .limit(1);
  if (!league) throw new ModelLabValidationError("The selected active league could not be found.");

  const config: PointInTimeDatasetConfig = {
    leagueId: league.id,
    predictionHorizonHours: input.predictionHorizonHours,
    minimumHistoryMatches: input.minimumHistoryMatches,
    resultAvailabilityHours: input.resultAvailabilityHours ?? DEFAULT_RESULT_AVAILABILITY_HOURS,
  };
  const [fixtureRows, statRows, oddsRows] = await Promise.all([
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
    }).from(fixtures).where(eq(fixtures.leagueId, league.id)),
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
    }).from(teamMatchStats)
      .innerJoin(fixtures, eq(teamMatchStats.fixtureId, fixtures.id))
      .where(eq(fixtures.leagueId, league.id)),
    db.select({
      id: oddsSnapshots.id,
      fixtureId: oddsSnapshots.fixtureId,
      bookmaker: oddsSnapshots.bookmaker,
      market: oddsSnapshots.market,
      selection: oddsSnapshots.selection,
      decimalOdds: oddsSnapshots.decimalOdds,
      capturedAt: oddsSnapshots.capturedAt,
    }).from(oddsSnapshots)
      .innerJoin(fixtures, eq(oddsSnapshots.fixtureId, fixtures.id))
      .where(eq(fixtures.leagueId, league.id)),
  ]);

  const result = await buildPointInTimeDataset({ fixtures: fixtureRows, stats: statRows, odds: oddsRows, config });
  if (result.audit.eligibleSampleCount < MINIMUM_PERSISTED_SAMPLES) {
    throw new ModelLabValidationError(
      `Only ${result.audit.eligibleSampleCount} eligible point-in-time samples were generated; at least ${MINIMUM_PERSISTED_SAMPLES} are required for an immutable research dataset.`,
    );
  }

  const [existing] = await db.select().from(featureDatasetRuns)
    .where(eq(featureDatasetRuns.datasetChecksumSha256, result.datasetChecksumSha256))
    .limit(1);
  if (existing) {
    if (existing.status !== "completed") {
      throw new ModelLabValidationError(`This exact dataset already exists with status ${existing.status}.`);
    }
    return { dataset: toDatasetSummary(existing), reused: true };
  }

  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const name = normalizeDatasetName(input.name, league.name, config.predictionHorizonHours);
  const configJson = canonicalDatasetJson(config);
  const auditJson = canonicalDatasetJson(result.audit);
  let runInserted = false;

  try {
    await db.insert(featureDatasetRuns).values({
      id: runId,
      name,
      leagueId: league.id,
      leagueLabel: league.name,
      market: "1X2",
      status: "building",
      predictionHorizonHours: config.predictionHorizonHours,
      minimumHistoryMatches: config.minimumHistoryMatches,
      resultAvailabilityHours: config.resultAvailabilityHours,
      statsAvailabilityPolicy: "fixture_end_plus_buffer",
      sourceFixtureCount: result.audit.sourceFixtureCount,
      eligibleSampleCount: result.audit.eligibleSampleCount,
      rejectedSampleCount: result.audit.rejectedSampleCount,
      averageDataCompleteness: result.audit.averageDataCompleteness,
      oddsCoverage: result.audit.oddsCoverage,
      featureSchemaVersion: result.featureSchemaVersion,
      benchmarkSchemaVersion: result.benchmarkSchemaVersion,
      builderVersion: result.builderVersion,
      configJson,
      datasetChecksumSha256: result.datasetChecksumSha256,
      auditJson,
      createdByEmail: actor.email,
      startedAt,
    });
    runInserted = true;

    for (let index = 0; index < result.records.length; index += 40) {
      const statements = result.records.slice(index, index + 40).map(({ sample, featurePayload }) => (
        db.insert(featureDatasetSamples).values({
          id: crypto.randomUUID(),
          datasetRunId: runId,
          fixtureId: sample.fixtureId,
          predictionAt: sample.predictionAt,
          kickoffAt: sample.kickoffAt,
          featureCutoffAt: sample.featureCutoffAt,
          resultKnownAt: sample.resultKnownAt ?? sample.kickoffAt,
          actualOutcome: sample.actualOutcome,
          probabilityHome: sample.probabilities.home,
          probabilityDraw: sample.probabilities.draw,
          probabilityAway: sample.probabilities.away,
          dataCompleteness: sample.dataCompleteness,
          featureFingerprint: sample.featureFingerprint,
          oddsBookmaker: featurePayload.provenance.oddsBookmaker,
          oddsCapturedAt: sample.odds?.capturedAt ?? null,
          oddsHome: sample.odds?.home ?? null,
          oddsDraw: sample.odds?.draw ?? null,
          oddsAway: sample.odds?.away ?? null,
          closingOddsCapturedAt: featurePayload.provenance.closingOddsCapturedAt,
          closingHome: sample.odds?.closingHome ?? null,
          closingDraw: sample.odds?.closingDraw ?? null,
          closingAway: sample.odds?.closingAway ?? null,
          featureJson: canonicalDatasetJson(featurePayload),
          benchmarkJson: canonicalDatasetJson(featurePayload.benchmarks),
          sampleJson: canonicalDatasetJson(sample),
        })
      ));
      if (statements.length) {
        await db.batch(statements as [typeof statements[number], ...Array<typeof statements[number]>]);
      }
    }

    const completedAt = new Date().toISOString();
    await db.batch([
      db.update(featureDatasetRuns).set({ status: "completed", completedAt }).where(eq(featureDatasetRuns.id, runId)),
      db.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorEmail: actor.email,
        action: "model.dataset.completed",
        entityType: "feature_dataset_run",
        entityId: runId,
        detailsJson: canonicalDatasetJson({
          leagueId: league.id,
          market: "1X2",
          builderVersion: DATASET_BUILDER_VERSION,
          datasetChecksumSha256: result.datasetChecksumSha256,
          audit: result.audit,
          researchOnly: true,
        }),
      }),
    ]);

    return {
      dataset: toDatasetSummary({
        id: runId,
        name,
        leagueId: league.id,
        leagueLabel: league.name,
        market: "1X2",
        status: "completed",
        predictionHorizonHours: config.predictionHorizonHours,
        minimumHistoryMatches: config.minimumHistoryMatches,
        resultAvailabilityHours: config.resultAvailabilityHours,
        statsAvailabilityPolicy: "fixture_end_plus_buffer",
        sourceFixtureCount: result.audit.sourceFixtureCount,
        eligibleSampleCount: result.audit.eligibleSampleCount,
        rejectedSampleCount: result.audit.rejectedSampleCount,
        averageDataCompleteness: result.audit.averageDataCompleteness,
        oddsCoverage: result.audit.oddsCoverage,
        featureSchemaVersion: result.featureSchemaVersion,
        benchmarkSchemaVersion: result.benchmarkSchemaVersion,
        builderVersion: result.builderVersion,
        configJson,
        datasetChecksumSha256: result.datasetChecksumSha256,
        auditJson,
        createdByEmail: actor.email,
        errorMessage: null,
        startedAt,
        completedAt,
        createdAt: startedAt,
      }),
      reused: false,
    };
  } catch (error) {
    if (runInserted) {
      const completedAt = new Date().toISOString();
      const errorMessage = error instanceof Error ? error.message.slice(0, 500) : "Dataset persistence failed.";
      try {
        await db.batch([
          db.update(featureDatasetRuns).set({ status: "failed", errorMessage, completedAt }).where(eq(featureDatasetRuns.id, runId)),
          db.insert(auditLogs).values({
            id: crypto.randomUUID(),
            actorEmail: actor.email,
            action: "model.dataset.failed",
            entityType: "feature_dataset_run",
            entityId: runId,
            detailsJson: canonicalDatasetJson({ datasetChecksumSha256: result.datasetChecksumSha256, errorMessage }),
          }),
        ]);
      } catch {
        // The original storage failure is more useful than a secondary audit failure.
      }
    }
    throw error;
  }
}

function normalizeDatasetName(name: string | undefined, leagueLabel: string, horizon: number) {
  const normalized = name?.trim() || `${leagueLabel} · ${horizon}h point-in-time`;
  if (normalized.length < 4 || normalized.length > 100) {
    throw new ModelLabValidationError("Dataset name must be between 4 and 100 characters.");
  }
  return normalized;
}

function toDatasetSummary(row: typeof featureDatasetRuns.$inferSelect): FeatureDatasetSummary {
  let audit: { leakageViolationCount?: number; availabilityAssumption?: string } = {};
  try {
    audit = JSON.parse(row.auditJson) as typeof audit;
  } catch {
    // A malformed audit is surfaced as missing rather than breaking the whole control plane.
  }
  return {
    id: row.id,
    name: row.name,
    leagueId: row.leagueId,
    leagueLabel: row.leagueLabel,
    market: row.market,
    status: row.status,
    predictionHorizonHours: row.predictionHorizonHours,
    minimumHistoryMatches: row.minimumHistoryMatches,
    resultAvailabilityHours: row.resultAvailabilityHours,
    sourceFixtureCount: row.sourceFixtureCount,
    eligibleSampleCount: row.eligibleSampleCount,
    rejectedSampleCount: row.rejectedSampleCount,
    averageDataCompleteness: row.averageDataCompleteness,
    oddsCoverage: row.oddsCoverage,
    featureSchemaVersion: row.featureSchemaVersion,
    benchmarkSchemaVersion: row.benchmarkSchemaVersion,
    builderVersion: row.builderVersion,
    datasetChecksumSha256: row.datasetChecksumSha256,
    leakageViolationCount: audit.leakageViolationCount ?? 0,
    availabilityAssumption: audit.availabilityAssumption ?? "Availability audit unavailable.",
    createdByEmail: row.createdByEmail,
    errorMessage: row.errorMessage,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
  };
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
