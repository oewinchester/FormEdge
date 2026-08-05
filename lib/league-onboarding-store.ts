import { count, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLogs,
  dataSources,
  fixtureMappings,
  fixtures,
  ingestionRuns,
  leagueOnboardingAssessments,
  leagues,
  lineupSnapshots,
  oddsSnapshots,
  researchSourceRuns,
  teamAliases,
  teamMatchStats,
} from "@/db/schema";
import type { AdminActor } from "@/lib/admin-data";
import {
  buildLeagueOnboardingAssessment,
  canonicalLeagueOnboardingJson,
  type LeagueOnboardingComponentId,
  type LeagueOnboardingEvidence,
} from "@/lib/league-onboarding-quality";

type LiveAssessment = Awaited<ReturnType<typeof buildLiveAssessments>>[number];

export async function getLeagueOnboardingOverview(actor: AdminActor) {
  const db = await getDb();
  const evaluatedAt = evaluationHour();
  const [live, storedRows, [{ total: storedCount }]] = await Promise.all([
    buildLiveAssessments(evaluatedAt),
    db.select().from(leagueOnboardingAssessments)
      .orderBy(desc(leagueOnboardingAssessments.evaluatedAt))
      .limit(250),
    db.select({ total: count() }).from(leagueOnboardingAssessments),
  ]);
  const latestStored = new Map<string, typeof storedRows[number]>();
  for (const row of storedRows) {
    const key = pairKey(row.leagueId, row.sourceId);
    if (!latestStored.has(key)) latestStored.set(key, row);
  }
  const assessments = live.map((item) => {
    const stored = latestStored.get(pairKey(item.manifest.leagueId, item.manifest.sourceId)) ?? null;
    return publicAssessment(item, stored);
  });

  return {
    actor: { email: actor.email, displayName: actor.displayName, role: actor.role },
    generatedAt: new Date().toISOString(),
    evaluatedAt,
    counts: {
      evaluatedPairs: assessments.length,
      readyForResearch: assessments.filter((item) => item.manifest.state === "ready_for_research").length,
      review: assessments.filter((item) => item.manifest.state === "review").length,
      blocked: assessments.filter((item) => item.manifest.state === "blocked").length,
      storedAssessments: Number(storedCount ?? 0),
    },
    assessments,
    policy: {
      scoreVersion: "league-onboarding-quality-v1",
      readyThreshold: 80,
      evaluationTimeBucket: "hour",
      sourceUnit: "league_source_pair",
      researchOnly: true,
      recommendationEligible: false,
      scoreCanOpenRecommendationGate: false,
      blockersFailClosed: true,
    },
  };
}

export async function persistLeagueOnboardingAssessments(
  actor: AdminActor,
  leagueId?: string | null,
) {
  const db = await getDb();
  const evaluatedAt = evaluationHour();
  const normalizedLeagueId = normalizeLeagueId(leagueId);
  const assessments = (await buildLiveAssessments(evaluatedAt))
    .filter((item) => !normalizedLeagueId || item.manifest.leagueId === normalizedLeagueId);
  if (normalizedLeagueId && assessments.length === 0) {
    throw new LeagueOnboardingError(404, "LEAGUE_SOURCE_PAIR_NOT_FOUND", "Bu lig için değerlendirilebilir bir kaynak bağlantısı bulunamadı.");
  }

  let insertedCount = 0;
  let reusedCount = 0;
  for (const assessment of assessments) {
    const components = new Map(assessment.manifest.components.map((item) => [item.id, item.score]));
    const id = crypto.randomUUID();
    const inserted = await db.insert(leagueOnboardingAssessments).values({
      id,
      leagueId: assessment.manifest.leagueId,
      sourceId: assessment.manifest.sourceId,
      schemaVersion: assessment.manifest.schemaVersion,
      evidenceFingerprintSha256: assessment.evidenceFingerprintSha256,
      score: assessment.manifest.score,
      grade: assessment.manifest.grade,
      state: assessment.manifest.state,
      licenseScore: componentScore(components, "license"),
      historyDepthScore: componentScore(components, "history_depth"),
      identityMappingScore: componentScore(components, "identity_mapping"),
      advancedDataScore: componentScore(components, "advanced_data"),
      lineupCoverageScore: componentScore(components, "lineup_coverage"),
      oddsTimestampScore: componentScore(components, "odds_timestamp"),
      sourceSlaScore: componentScore(components, "source_sla"),
      blockerCount: assessment.manifest.blockerCodes.length,
      warningCount: assessment.manifest.warningCodes.length,
      blockerCodesJson: canonicalLeagueOnboardingJson(assessment.manifest.blockerCodes),
      warningCodesJson: canonicalLeagueOnboardingJson(assessment.manifest.warningCodes),
      manifestJson: canonicalLeagueOnboardingJson(assessment.manifest),
      researchOnly: true,
      recommendationEligible: false,
      evaluatedByEmail: actor.email,
      evaluatedAt: assessment.manifest.evaluatedAt,
    }).onConflictDoNothing();
    if (changedRows(inserted) > 0) {
      insertedCount += 1;
      await db.insert(auditLogs).values({
        id: crypto.randomUUID(),
        actorEmail: actor.email,
        action: "league_onboarding.assessment.persisted",
        entityType: "league_onboarding_assessment",
        entityId: id,
        detailsJson: canonicalLeagueOnboardingJson({
          leagueId: assessment.manifest.leagueId,
          sourceId: assessment.manifest.sourceId,
          score: assessment.manifest.score,
          state: assessment.manifest.state,
          evidenceFingerprintSha256: assessment.evidenceFingerprintSha256,
          researchOnly: true,
          recommendationEligible: false,
        }),
      });
    } else {
      reusedCount += 1;
    }
  }
  return {
    evaluatedAt,
    insertedCount,
    reusedCount,
    assessmentCount: assessments.length,
    researchOnly: true,
    recommendationEligible: false,
  };
}

async function buildLiveAssessments(evaluatedAt: string) {
  const db = await getDb();
  const [
    fixtureRows,
    fixtureTeamRows,
    researchPairs,
    leagueRows,
    sourceRows,
    aliasRows,
    fixtureMappingRows,
    advancedRows,
    lineupRows,
    oddsRows,
    sourceSlaRows,
  ] = await Promise.all([
    db.select({
      leagueId: fixtures.leagueId,
      sourceId: fixtures.sourceId,
      fixtureCount: count(),
      finishedFixtureCount: sql<number>`sum(case when ${fixtures.status} = 'finished' then 1 else 0 end)`,
      seasonCount: sql<number>`count(distinct ${fixtures.season})`,
    }).from(fixtures).groupBy(fixtures.leagueId, fixtures.sourceId),
    db.select({
      leagueId: fixtures.leagueId,
      sourceId: fixtures.sourceId,
      homeTeamId: fixtures.homeTeamId,
      awayTeamId: fixtures.awayTeamId,
    }).from(fixtures).groupBy(
      fixtures.leagueId,
      fixtures.sourceId,
      fixtures.homeTeamId,
      fixtures.awayTeamId,
    ),
    db.select({ leagueId: researchSourceRuns.leagueId, sourceId: researchSourceRuns.sourceId })
      .from(researchSourceRuns).groupBy(researchSourceRuns.leagueId, researchSourceRuns.sourceId),
    db.select().from(leagues),
    db.select().from(dataSources),
    db.select({
      sourceId: teamAliases.sourceId,
      teamId: teamAliases.teamId,
      status: teamAliases.status,
    }).from(teamAliases),
    db.select({
      leagueId: fixtures.leagueId,
      sourceId: fixtureMappings.sourceId,
      total: count(),
      matched: sql<number>`sum(case when ${fixtureMappings.status} = 'matched' then 1 else 0 end)`,
    }).from(fixtureMappings)
      .innerJoin(fixtures, eq(fixtureMappings.fixtureId, fixtures.id))
      .groupBy(fixtures.leagueId, fixtureMappings.sourceId),
    db.select({
      leagueId: fixtures.leagueId,
      sourceId: fixtures.sourceId,
      supplied: sql<number>`sum(
        case when ${teamMatchStats.possession} is not null then 1 else 0 end +
        case when ${teamMatchStats.shots} is not null then 1 else 0 end +
        case when ${teamMatchStats.shotsOnTarget} is not null then 1 else 0 end +
        case when ${teamMatchStats.expectedGoals} is not null then 1 else 0 end +
        case when ${teamMatchStats.dangerousAttacks} is not null then 1 else 0 end +
        case when ${teamMatchStats.penaltyAreaEntries} is not null then 1 else 0 end +
        case when ${teamMatchStats.ppda} is not null then 1 else 0 end +
        case when ${teamMatchStats.bigChancesAllowed} is not null then 1 else 0 end
      )`,
    }).from(teamMatchStats)
      .innerJoin(fixtures, eq(teamMatchStats.fixtureId, fixtures.id))
      .where(eq(fixtures.status, "finished"))
      .groupBy(fixtures.leagueId, fixtures.sourceId),
    db.select({
      leagueId: fixtures.leagueId,
      sourceId: fixtures.sourceId,
      fixtureId: lineupSnapshots.fixtureId,
      teamCount: sql<number>`count(distinct ${lineupSnapshots.teamId})`,
    }).from(lineupSnapshots)
      .innerJoin(fixtures, eq(lineupSnapshots.fixtureId, fixtures.id))
      .groupBy(fixtures.leagueId, fixtures.sourceId, lineupSnapshots.fixtureId),
    db.select({
      leagueId: fixtures.leagueId,
      sourceId: fixtures.sourceId,
      fixtureId: oddsSnapshots.fixtureId,
      bookmaker: oddsSnapshots.bookmaker,
      capturedAt: oddsSnapshots.capturedAt,
      kickoffAt: fixtures.kickoffAt,
      snapshotCount: count(),
      selectionCount: sql<number>`count(distinct ${oddsSnapshots.selection})`,
    }).from(oddsSnapshots)
      .innerJoin(fixtures, eq(oddsSnapshots.fixtureId, fixtures.id))
      .where(eq(oddsSnapshots.market, "1X2"))
      .groupBy(
        fixtures.leagueId,
        fixtures.sourceId,
        oddsSnapshots.fixtureId,
        oddsSnapshots.bookmaker,
        oddsSnapshots.capturedAt,
        fixtures.kickoffAt,
      ),
    db.select({
      sourceId: ingestionRuns.sourceId,
      runCount: count(),
      completedRunCount: sql<number>`sum(case when ${ingestionRuns.status} = 'completed' then 1 else 0 end)`,
      failedRunCount: sql<number>`sum(case when ${ingestionRuns.status} = 'failed' then 1 else 0 end)`,
      lastSuccessfulAt: sql<string | null>`max(case when ${ingestionRuns.status} = 'completed' then coalesce(${ingestionRuns.completedAt}, ${ingestionRuns.capturedAt}) end)`,
    }).from(ingestionRuns).groupBy(ingestionRuns.sourceId),
  ]);

  const fixturesByPair = new Map(fixtureRows.map((row) => [pairKey(row.leagueId, row.sourceId), row]));
  const pairs = new Map<string, { leagueId: string; sourceId: string }>();
  for (const row of fixtureRows) pairs.set(pairKey(row.leagueId, row.sourceId), row);
  for (const row of researchPairs) pairs.set(pairKey(row.leagueId, row.sourceId), row);
  const leagueById = new Map(leagueRows.map((row) => [row.id, row]));
  const sourceById = new Map(sourceRows.map((row) => [row.id, row]));
  const teamsByPair = new Map<string, Set<string>>();
  for (const row of fixtureTeamRows) {
    const key = pairKey(row.leagueId, row.sourceId);
    const teamIds = teamsByPair.get(key) ?? new Set<string>();
    teamIds.add(row.homeTeamId);
    teamIds.add(row.awayTeamId);
    teamsByPair.set(key, teamIds);
  }
  const matchedAliasTeamsBySource = new Map<string, Set<string>>();
  for (const row of aliasRows) {
    if (row.status !== "matched") continue;
    const teamIds = matchedAliasTeamsBySource.get(row.sourceId) ?? new Set<string>();
    teamIds.add(row.teamId);
    matchedAliasTeamsBySource.set(row.sourceId, teamIds);
  }
  const mappingsByPair = new Map(fixtureMappingRows.map((row) => [pairKey(row.leagueId, row.sourceId), row]));
  const advancedByPair = new Map(advancedRows.map((row) => [pairKey(row.leagueId, row.sourceId), row]));
  const slaBySource = new Map(sourceSlaRows.map((row) => [row.sourceId, row]));
  const fullLineupsByPair = new Map<string, number>();
  for (const row of lineupRows) {
    if (Number(row.teamCount) < 2) continue;
    const key = pairKey(row.leagueId, row.sourceId);
    fullLineupsByPair.set(key, (fullLineupsByPair.get(key) ?? 0) + 1);
  }
  const oddsByPair = new Map<string, {
    coveredFixtureIds: Set<string>;
    snapshotCount: number;
    preKickoffSnapshotCount: number;
  }>();
  for (const row of oddsRows) {
    const key = pairKey(row.leagueId, row.sourceId);
    const bucket = oddsByPair.get(key) ?? {
      coveredFixtureIds: new Set<string>(),
      snapshotCount: 0,
      preKickoffSnapshotCount: 0,
    };
    const rowCount = Number(row.snapshotCount ?? 0);
    const preKickoff = Date.parse(row.capturedAt) < Date.parse(row.kickoffAt);
    bucket.snapshotCount += rowCount;
    if (preKickoff) {
      bucket.preKickoffSnapshotCount += rowCount;
      if (Number(row.selectionCount) >= 3) bucket.coveredFixtureIds.add(row.fixtureId);
    }
    oddsByPair.set(key, bucket);
  }

  const results: Array<Awaited<ReturnType<typeof buildLeagueOnboardingAssessment>>> = [];
  for (const pair of [...pairs.values()].sort((left, right) => (
    `${left.leagueId}|${left.sourceId}`.localeCompare(`${right.leagueId}|${right.sourceId}`)
  ))) {
    const key = pairKey(pair.leagueId, pair.sourceId);
    const league = leagueById.get(pair.leagueId);
    const source = sourceById.get(pair.sourceId);
    if (!league || !source) continue;
    const fixture = fixturesByPair.get(key);
    const leagueTeamIds = teamsByPair.get(key) ?? new Set<string>();
    const matchedAliasTeamIds = matchedAliasTeamsBySource.get(pair.sourceId) ?? new Set<string>();
    const mapping = mappingsByPair.get(key);
    const advanced = advancedByPair.get(key);
    const odds = oddsByPair.get(key);
    const sla = slaBySource.get(pair.sourceId);
    const fixtureCount = Number(fixture?.fixtureCount ?? 0);
    const finishedFixtureCount = Number(fixture?.finishedFixtureCount ?? 0);
    const evidence: LeagueOnboardingEvidence = {
      evaluatedAt,
      league: {
        id: league.id,
        name: league.name,
        countryCode: league.countryCode,
        coverageLevel: league.coverageLevel,
        active: league.isActive,
      },
      source: {
        id: source.id,
        name: source.name,
        legalStatus: source.legalStatus,
        acquisitionMethod: source.acquisitionMethod,
        active: source.isActive,
      },
      history: {
        fixtureCount,
        finishedFixtureCount,
        seasonCount: Number(fixture?.seasonCount ?? 0),
      },
      identity: {
        aliasTotal: leagueTeamIds.size,
        aliasMatched: [...leagueTeamIds].filter((teamId) => matchedAliasTeamIds.has(teamId)).length,
        fixtureMappingTotal: Number(mapping?.total ?? 0),
        fixtureMappingMatched: Number(mapping?.matched ?? 0),
      },
      advancedData: {
        expectedFieldCount: finishedFixtureCount * 2 * 8,
        suppliedFieldCount: Number(advanced?.supplied ?? 0),
      },
      lineups: {
        eligibleFixtureCount: fixtureCount,
        fullyCoveredFixtureCount: fullLineupsByPair.get(key) ?? 0,
      },
      odds: {
        fixtureCount,
        coveredFixtureCount: odds?.coveredFixtureIds.size ?? 0,
        snapshotCount: odds?.snapshotCount ?? 0,
        preKickoffSnapshotCount: odds?.preKickoffSnapshotCount ?? 0,
      },
      sourceSla: {
        runCount: Number(sla?.runCount ?? 0),
        completedRunCount: Number(sla?.completedRunCount ?? 0),
        failedRunCount: Number(sla?.failedRunCount ?? 0),
        lastSuccessfulAt: sla?.lastSuccessfulAt ?? null,
      },
    };
    results.push(await buildLeagueOnboardingAssessment(evidence));
  }
  return results;
}

function publicAssessment(
  item: LiveAssessment,
  stored: typeof leagueOnboardingAssessments.$inferSelect | null,
) {
  return {
    evidenceFingerprintSha256: item.evidenceFingerprintSha256,
    manifest: item.manifest,
    persisted: stored ? {
      id: stored.id,
      evaluatedAt: stored.evaluatedAt,
      evaluatedByEmail: stored.evaluatedByEmail,
      evidenceFingerprintSha256: stored.evidenceFingerprintSha256,
      score: stored.score,
      state: stored.state,
      stale: stored.evidenceFingerprintSha256 !== item.evidenceFingerprintSha256,
    } : null,
  };
}

function componentScore(
  components: Map<LeagueOnboardingComponentId, number>,
  id: LeagueOnboardingComponentId,
) {
  return components.get(id) ?? 0;
}

function evaluationHour(now = new Date()) {
  const value = new Date(now);
  value.setUTCMinutes(0, 0, 0);
  return value.toISOString();
}

function normalizeLeagueId(value?: string | null) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !value.trim() || value.length > 128) {
    throw new LeagueOnboardingError(400, "LEAGUE_ID_INVALID", "Lig kimliği geçersiz.");
  }
  return value.trim();
}

function pairKey(leagueId: string, sourceId: string) { return `${leagueId}\u0000${sourceId}`; }

function changedRows(value: unknown) {
  if (!value || typeof value !== "object") return 0;
  const meta = "meta" in value ? (value as { meta?: { changes?: number } }).meta : null;
  return Number(meta?.changes ?? 0);
}

export class LeagueOnboardingError extends Error {
  constructor(
    public status: 400 | 404,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export type LeagueOnboardingOverview = Awaited<ReturnType<typeof getLeagueOnboardingOverview>>;
