import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNull,
  gte,
  lte,
  lt,
} from "drizzle-orm";
import type { ChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import {
  fixtures,
  ingestionRuns,
  leagues,
  predictionEvents,
  predictionSettlements,
  predictionThreads,
  predictionValueAssessments,
  predictionVersions,
  researchFixtureFeedRuns,
  teamMatchStats,
  teams,
  userNotifications,
  userDashboardPreferences,
  userPredictionWatchlist,
} from "@/db/schema";
import { ModelLabValidationError } from "@/lib/model-lab";
import {
  authorizeMatchAnalysisView,
  getUserMembershipCenter,
} from "@/lib/membership-store";
import { ensureUserProductAccount } from "@/lib/user-account-store";
import { summarizePerformance, type SettlementStatus } from "@/lib/user-performance";
import { toPublicValueAssessment } from "@/lib/value-assessment-store";
import {
  assessLiveSlateFreshness,
  getIstanbulSlateWindow,
  slateDayLabel,
} from "@/lib/today-slate";

export type DashboardPreferenceInput = {
  defaultAnalysisView?: "quick" | "detailed";
  performanceMode?: "system" | "personal";
  showWithdrawn?: boolean;
};

export async function getUserDashboardOverview(user: ChatGPTUser) {
  const account = await ensureUserProductAccount(user);
  const db = await getDb();
  const [matches, todaySlate, history, unreadRows, membershipCenter] = await Promise.all([
    loadVisiblePredictionCards(user.email),
    loadTodayResearchSlate(),
    loadPublishedPerformanceRecords(),
    db.select({ total: count() }).from(userNotifications).where(and(
      eq(userNotifications.userEmail, user.email),
      isNull(userNotifications.readAt),
    )),
    getUserMembershipCenter(user),
  ]);
  const accessibleHistory = membershipCenter.membership.productAccess ? history : [];
  const settledRows = accessibleHistory
    .filter((record) => record.resultStatus !== "pending")
    .map((record) => ({
      settlementStatus: record.resultStatus as SettlementStatus,
      leagueLabel: record.leagueLabel,
      market: record.market,
      settledAt: record.settledAt ?? record.publishedAt,
    }));
  const performance = summarizePerformance(settledRows);
  const accessibleMatches = membershipCenter.membership.productAccess ? matches : [];
  const visibleMatches = account.preferences.showWithdrawn
    ? accessibleMatches
    : accessibleMatches.filter((match) => match.status !== "withdrawn");
  const effectivePreferences = membershipCenter.membership.entitlements.detailedAnalysis
    ? account.preferences
    : { ...account.preferences, defaultAnalysisView: "quick" as const };

  return {
    generatedAt: new Date().toISOString(),
    profile: account.profile,
    preferences: effectivePreferences,
    membership: membershipCenter.membership,
    counts: {
      watchlist: visibleMatches.filter((match) => match.status === "watchlist").length,
      final: visibleMatches.filter((match) => match.status === "final").length,
      withdrawn: visibleMatches.filter((match) => match.status === "withdrawn").length,
      saved: visibleMatches.filter((match) => match.saved).length,
      valueOpportunities: visibleMatches.filter((match) => match.value?.recommendationEligible).length,
      marketAnomalies: visibleMatches.filter((match) => match.value?.status === "market_anomaly").length,
      publishedHistory: accessibleHistory.length,
      settledHistory: settledRows.length,
      notificationsUnread: Number(unreadRows[0]?.total ?? 0),
    },
    matches: visibleMatches.slice(0, 24),
    todaySlate: membershipCenter.membership.productAccess ? todaySlate : { ...todaySlate, matches: [] },
    latestHistory: accessibleHistory.slice(0, 6),
    performance,
    availability: {
      publishableAnalysisCount: visibleMatches.length,
      researchRecordsHidden: true,
      researchSlateVisible: true,
      valueEngineStatus: "active_cp12" as const,
      bankrollStatus: "active_cp13" as const,
      couponStatus: "active_cp13" as const,
      notificationStatus: "active_cp14" as const,
      membershipStatus: "active_cp15" as const,
      publicIdentityStatus: "external_provider_gate" as const,
    },
  };
}

async function loadTodayResearchSlate() {
  const db = await getDb();
  const generatedAt = new Date().toISOString();
  const window = getIstanbulSlateWindow(generatedAt);
  const [fixtureRows, feedRows] = await Promise.all([
    db.select({
      fixture: fixtures,
      leagueLabel: leagues.name,
      ingestionCapturedAt: ingestionRuns.capturedAt,
    }).from(fixtures)
      .innerJoin(leagues, eq(fixtures.leagueId, leagues.id))
      .innerJoin(ingestionRuns, eq(fixtures.ingestionRunId, ingestionRuns.id))
      .where(and(
        gte(fixtures.kickoffAt, window.startIso),
        lte(fixtures.kickoffAt, window.endIso),
        inArray(fixtures.status, ["scheduled", "live"]),
      ))
      .orderBy(asc(fixtures.kickoffAt))
      .limit(160),
    db.select().from(researchFixtureFeedRuns)
      .orderBy(desc(researchFixtureFeedRuns.startedAt)).limit(1),
  ]);
  const fixtureIds = fixtureRows.map((row) => row.fixture.id);
  const teamIds = [...new Set(fixtureRows.flatMap((row) => [row.fixture.homeTeamId, row.fixture.awayTeamId]))];
  const [teamRows, threadRows] = await Promise.all([
    teamIds.length
      ? db.select({ id: teams.id, name: teams.name }).from(teams).where(inArray(teams.id, teamIds))
      : Promise.resolve([]),
    fixtureIds.length
      ? db.select().from(predictionThreads).where(inArray(predictionThreads.fixtureId, fixtureIds))
      : Promise.resolve([]),
  ]);
  const versionIds = threadRows.flatMap((thread) => thread.currentVersionId ? [thread.currentVersionId] : []);
  const versionRows = versionIds.length
    ? await db.select().from(predictionVersions).where(inArray(predictionVersions.id, versionIds))
    : [];
  const teamById = new Map(teamRows.map((team) => [team.id, team.name]));
  const threadByFixture = new Map(threadRows.map((thread) => [thread.fixtureId, thread]));
  const versionById = new Map(versionRows.map((version) => [version.id, version]));
  const latestFeed = feedRows[0] ?? null;
  const freshness = assessLiveSlateFreshness({
    generatedAt,
    capturedAt: latestFeed?.completedAt ?? latestFeed?.startedAt ?? null,
    status: latestFeed?.status ?? "never_run",
  });
  const matches = fixtureRows.map(({ fixture, leagueLabel, ingestionCapturedAt }) => {
    const thread = threadByFixture.get(fixture.id) ?? null;
    const version = thread?.currentVersionId ? versionById.get(thread.currentVersionId) ?? null : null;
    const recommendationEligible = Boolean(
      thread
      && version
      && !thread.researchOnly
      && thread.recommendationEligible
      && !version.researchOnly
      && version.recommendationEligible
      && version.recommendationOutcome,
    );
    return {
      fixtureId: fixture.id,
      kickoffAt: fixture.kickoffAt,
      day: slateDayLabel(fixture.kickoffAt, window),
      fixtureStatus: fixture.status,
      leagueLabel,
      homeTeamName: teamById.get(fixture.homeTeamId) ?? fixture.homeTeamId,
      awayTeamName: teamById.get(fixture.awayTeamId) ?? fixture.awayTeamId,
      capturedAt: ingestionCapturedAt,
      analysis: version ? toAnalysisVersion(version) : null,
      recommendation: recommendationEligible ? {
        outcome: version!.recommendationOutcome!,
        eligible: true as const,
      } : null,
      researchOnly: !recommendationEligible,
      blockers: version ? parseJson<string[]>(version.blockerCodesJson, []) : ["MODEL_ANALYSIS_PENDING"],
    };
  });
  return {
    generatedAt,
    timezone: "Europe/Istanbul" as const,
    window: { startAt: window.startIso, todayEndsAt: window.todayEndIso, endAt: window.endIso },
    source: {
      name: latestFeed?.adapterVersion?.startsWith("football-data-org-") ? "football-data.org v4" : "Football-Data.co.uk fixture feed",
      status: latestFeed?.status ?? "never_run",
      capturedAt: freshness.capturedAt,
      freshness: freshness.level,
      ageMinutes: freshness.ageMinutes,
      errorCode: latestFeed?.errorCode ?? null,
      note: latestFeed?.adapterVersion?.startsWith("football-data-org-")
        ? "Kimlik doğrulamalı fikstür API'si; oran sağlamaz ve öneri kapıları ayrıca uygulanır."
        : "Ücretsiz CSV akışı haftalık/takvimli güncellenir; canlı skor servisi değildir.",
    },
    counts: {
      today: matches.filter((match) => match.day === "today").length,
      upcoming: matches.filter((match) => match.day !== "today").length,
      analyzed: matches.filter((match) => match.analysis !== null).length,
      recommendations: matches.filter((match) => match.recommendation !== null).length,
    },
    matches,
    policy: {
      researchRecordsShownWithLabel: true,
      recommendationGatePreserved: true,
      noAutomaticBetInstruction: true,
    },
  };
}

export async function getUserPerformanceHistory(user: ChatGPTUser) {
  const account = await ensureUserProductAccount(user);
  const membershipCenter = await getUserMembershipCenter(user);
  const records = await loadPublishedPerformanceRecords();
  const historyDays = membershipCenter.membership.entitlements.historyDays;
  const historyCutoffMs = historyDays === null
    ? null
    : Date.now() - historyDays * 86_400_000;
  const planVisibleRecords = !membershipCenter.membership.productAccess
    ? []
    : historyCutoffMs === null
      ? records
      : records.filter((record) => Date.parse(record.publishedAt) >= historyCutoffMs);
  const visibleRecords = account.preferences.showWithdrawn
    ? planVisibleRecords
    : planVisibleRecords.filter((record) => record.resultStatus !== "withdrawn");
  const settledRows = visibleRecords
    .filter((record) => record.resultStatus !== "pending")
    .map((record) => ({
      settlementStatus: record.resultStatus as SettlementStatus,
      leagueLabel: record.leagueLabel,
      market: record.market,
      settledAt: record.settledAt ?? record.publishedAt,
    }));
  return {
    generatedAt: new Date().toISOString(),
    profile: account.profile,
    preferences: account.preferences,
    membership: membershipCenter.membership,
    summary: summarizePerformance(settledRows),
    pendingCount: visibleRecords.filter((record) => record.resultStatus === "pending").length,
    records: visibleRecords,
    filters: {
      leagues: [...new Set(visibleRecords.map((record) => record.leagueLabel))].sort(),
      markets: [...new Set(visibleRecords.map((record) => record.market))].sort(),
      statuses: ["won", "lost", "withdrawn", "void", "pending"] as const,
    },
    policy: {
      allFinalPublicationsPermanent: true,
      withdrawnRecordsPermanent: true,
      roiUnavailableUntilValueAndStakeLedger: true,
      methodWeightsHidden: true,
      visibleHistoryDays: historyDays,
      historyIsPlanLimited: historyDays !== null,
      csvExportAllowed: membershipCenter.membership.entitlements.exportFormats.includes("csv"),
      advancedExportsAllowed: membershipCenter.membership.entitlements.exportFormats.some((format) => format !== "csv"),
    },
  };
}

export async function getUserMatchAnalysis(user: ChatGPTUser, fixtureId: string) {
  if (!fixtureId.trim()) throw new ModelLabValidationError("A fixture id is required.");
  await ensureUserProductAccount(user);
  const db = await getDb();
  const [thread] = await db.select().from(predictionThreads).where(and(
    eq(predictionThreads.fixtureId, fixtureId.trim()),
    eq(predictionThreads.researchOnly, false),
  )).limit(1);
  if (!thread) return null;
  const [fixture] = await db.select().from(fixtures).where(eq(fixtures.id, thread.fixtureId)).limit(1);
  if (!fixture) return null;
  const selectedVersionId = thread.status === "watchlist"
    ? thread.currentVersionId
    : thread.finalVersionId ?? thread.currentVersionId;
  if (!selectedVersionId) return null;
  const [selectedVersion, versionRows, eventRows, savedRows, valueRows] = await Promise.all([
    db.select().from(predictionVersions).where(eq(predictionVersions.id, selectedVersionId)).limit(1),
    db.select().from(predictionVersions).where(and(
      eq(predictionVersions.threadId, thread.id),
      eq(predictionVersions.researchOnly, false),
    )).orderBy(desc(predictionVersions.versionNumber)).limit(20),
    db.select().from(predictionEvents).where(eq(predictionEvents.threadId, thread.id))
      .orderBy(desc(predictionEvents.sequence)).limit(40),
    db.select().from(userPredictionWatchlist).where(and(
      eq(userPredictionWatchlist.userEmail, user.email),
      eq(userPredictionWatchlist.threadId, thread.id),
    )).limit(1),
    db.select().from(predictionValueAssessments)
      .where(eq(predictionValueAssessments.predictionVersionId, selectedVersionId)).limit(1),
  ]);
  const version = selectedVersion[0];
  if (!version || version.researchOnly) return null;
  const access = await authorizeMatchAnalysisView(user, fixture.id);
  const historyFixtures = await db.select().from(fixtures).where(and(
    eq(fixtures.leagueId, fixture.leagueId),
    eq(fixtures.status, "finished"),
    lt(fixtures.kickoffAt, fixture.kickoffAt),
  )).orderBy(desc(fixtures.kickoffAt)).limit(160);
  const historyFixtureIds = historyFixtures.map((row) => row.id);
  const [teamRows, statRows, settlementRows] = await Promise.all([
    db.select({ id: teams.id, name: teams.name, shortName: teams.shortName })
      .from(teams).where(inArray(teams.id, [fixture.homeTeamId, fixture.awayTeamId])),
    historyFixtureIds.length
      ? db.select().from(teamMatchStats).where(inArray(teamMatchStats.fixtureId, historyFixtureIds))
      : Promise.resolve([]),
    db.select().from(predictionSettlements).where(eq(predictionSettlements.threadId, thread.id))
      .orderBy(desc(predictionSettlements.settledAt)),
  ]);
  const teamById = new Map(teamRows.map((team) => [team.id, team]));
  const statByFixtureTeam = new Map(statRows.map((row) => [`${row.fixtureId}|${row.teamId}`, row]));
  const homeForm = buildTeamForm(historyFixtures, fixture.homeTeamId, statByFixtureTeam);
  const awayForm = buildTeamForm(historyFixtures, fixture.awayTeamId, statByFixtureTeam);
  const h2h = historyFixtures
    .filter((row) => involvesBoth(row, fixture.homeTeamId, fixture.awayTeamId))
    .slice(0, 5)
    .map((row) => ({
      fixtureId: row.id,
      kickoffAt: row.kickoffAt,
      homeTeamName: teamById.get(row.homeTeamId)?.name ?? row.homeTeamId,
      awayTeamName: teamById.get(row.awayTeamId)?.name ?? row.awayTeamId,
      homeScore: row.homeScore,
      awayScore: row.awayScore,
    }));

  return {
    generatedAt: new Date().toISOString(),
    access,
    thread: {
      id: thread.id,
      status: thread.status,
      market: thread.market,
      leagueLabel: thread.leagueLabel,
      saved: savedRows.length > 0,
      withdrawalReason: eventRows.find((event) => event.eventType === "withdrawn")?.reasonText ?? null,
    },
    fixture: {
      id: fixture.id,
      kickoffAt: fixture.kickoffAt,
      status: fixture.status,
      homeTeamId: fixture.homeTeamId,
      awayTeamId: fixture.awayTeamId,
      homeTeamName: teamById.get(fixture.homeTeamId)?.name ?? fixture.homeTeamId,
      awayTeamName: teamById.get(fixture.awayTeamId)?.name ?? fixture.awayTeamId,
      homeScore: fixture.homeScore,
      awayScore: fixture.awayScore,
    },
    analysis: toAnalysisVersion(version),
    value: valueRows[0] ? toPublicValueAssessment(valueRows[0]) : null,
    form: { home: homeForm, away: awayForm },
    h2h,
    versions: versionRows.map(toPublicVersion),
    events: eventRows.map((event) => ({
      id: event.id,
      sequence: event.sequence,
      eventType: event.eventType,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      reasonCode: event.reasonCode,
      reasonText: event.reasonText,
      occurredAt: event.occurredAt,
      immediateNotification: event.immediateNotification,
    })),
    settlements: settlementRows.map((settlement) => ({
      id: settlement.id,
      finalVersionId: settlement.finalVersionId,
      predictedOutcome: settlement.predictedOutcome,
      actualOutcome: settlement.actualOutcome,
      settlementStatus: settlement.settlementStatus,
      homeScore: settlement.homeScore,
      awayScore: settlement.awayScore,
      settledAt: settlement.settledAt,
    })),
    disclosure: {
      methodWeightsHidden: true,
      probabilitiesIndependentFromOdds: true,
      noGuaranteedOutcome: true,
    },
  };
}

export async function setUserPredictionSaved(user: ChatGPTUser, threadId: string, saved: boolean) {
  if (!threadId.trim()) throw new ModelLabValidationError("A prediction thread id is required.");
  await ensureUserProductAccount(user);
  const db = await getDb();
  const [thread] = await db.select({ id: predictionThreads.id })
    .from(predictionThreads).where(and(
      eq(predictionThreads.id, threadId.trim()),
      eq(predictionThreads.researchOnly, false),
    )).limit(1);
  if (!thread) throw new ModelLabValidationError("This prediction is not available to users.");
  if (saved) {
    await db.insert(userPredictionWatchlist).values({
      userEmail: user.email,
      threadId: thread.id,
      source: "manual",
    }).onConflictDoNothing();
  } else {
    await db.delete(userPredictionWatchlist).where(and(
      eq(userPredictionWatchlist.userEmail, user.email),
      eq(userPredictionWatchlist.threadId, thread.id),
    ));
  }
  return { threadId: thread.id, saved };
}

export async function updateUserDashboardPreferences(user: ChatGPTUser, input: DashboardPreferenceInput) {
  if (!input || typeof input !== "object") {
    throw new ModelLabValidationError("Dashboard preferences are required.");
  }
  await ensureUserProductAccount(user);
  const membershipCenter = await getUserMembershipCenter(user);
  const db = await getDb();
  const values: Partial<typeof userDashboardPreferences.$inferInsert> = { updatedAt: new Date().toISOString() };
  if (input.defaultAnalysisView !== undefined) {
    if (!( ["quick", "detailed"] as string[]).includes(input.defaultAnalysisView)) {
      throw new ModelLabValidationError("The analysis view is invalid.");
    }
    if (input.defaultAnalysisView === "detailed"
      && !membershipCenter.membership.entitlements.detailedAnalysis) {
      throw new ModelLabValidationError("Detaylı analiz görünümü Pro veya Expert paketine açıktır.");
    }
    values.defaultAnalysisView = input.defaultAnalysisView;
  }
  if (input.performanceMode !== undefined) {
    if (!( ["system", "personal"] as string[]).includes(input.performanceMode)) {
      throw new ModelLabValidationError("The performance mode is invalid.");
    }
    values.performanceMode = input.performanceMode;
  }
  if (input.showWithdrawn !== undefined) {
    if (typeof input.showWithdrawn !== "boolean") {
      throw new ModelLabValidationError("showWithdrawn must be boolean.");
    }
    values.showWithdrawn = input.showWithdrawn;
  }
  await db.update(userDashboardPreferences).set(values)
    .where(eq(userDashboardPreferences.userEmail, user.email));
  const [preferences] = await db.select().from(userDashboardPreferences)
    .where(eq(userDashboardPreferences.userEmail, user.email)).limit(1);
  return preferences;
}

async function loadVisiblePredictionCards(userEmail: string) {
  const db = await getDb();
  const threadRows = await db.select().from(predictionThreads).where(and(
    eq(predictionThreads.researchOnly, false),
    inArray(predictionThreads.status, ["watchlist", "final", "withdrawn"]),
  )).orderBy(desc(predictionThreads.updatedAt)).limit(100);
  if (!threadRows.length) return [];
  const fixtureRows = await db.select().from(fixtures)
    .where(inArray(fixtures.id, [...new Set(threadRows.map((thread) => thread.fixtureId))]));
  const teamIds = [...new Set(fixtureRows.flatMap((fixture) => [fixture.homeTeamId, fixture.awayTeamId]))];
  const versionIds = [...new Set(threadRows.flatMap((thread) => {
    const id = thread.status === "watchlist"
      ? thread.currentVersionId
      : thread.finalVersionId ?? thread.currentVersionId;
    return id ? [id] : [];
  }))];
  const threadIds = threadRows.map((thread) => thread.id);
  const [teamRows, versionRows, savedRows, eventRows, valueRows] = await Promise.all([
    teamIds.length
      ? db.select({ id: teams.id, name: teams.name, shortName: teams.shortName })
        .from(teams).where(inArray(teams.id, teamIds))
      : Promise.resolve([]),
    versionIds.length
      ? db.select().from(predictionVersions).where(inArray(predictionVersions.id, versionIds))
      : Promise.resolve([]),
    db.select().from(userPredictionWatchlist).where(and(
      eq(userPredictionWatchlist.userEmail, userEmail),
      inArray(userPredictionWatchlist.threadId, threadIds),
    )),
    db.select().from(predictionEvents).where(and(
      inArray(predictionEvents.threadId, threadIds),
      eq(predictionEvents.eventType, "withdrawn"),
    )).orderBy(desc(predictionEvents.sequence)),
    versionIds.length
      ? db.select().from(predictionValueAssessments)
        .where(inArray(predictionValueAssessments.predictionVersionId, versionIds))
      : Promise.resolve([]),
  ]);
  const fixtureById = new Map(fixtureRows.map((fixture) => [fixture.id, fixture]));
  const teamById = new Map(teamRows.map((team) => [team.id, team]));
  const versionById = new Map(versionRows.map((version) => [version.id, version]));
  const valueByVersionId = new Map(valueRows.map((value) => [
    value.predictionVersionId,
    toPublicValueAssessment(value),
  ]));
  const savedThreadIds = new Set(savedRows.map((row) => row.threadId));
  const withdrawalByThread = new Map<string, typeof predictionEvents.$inferSelect>();
  for (const event of eventRows) if (!withdrawalByThread.has(event.threadId)) withdrawalByThread.set(event.threadId, event);

  return threadRows.flatMap((thread) => {
    const fixture = fixtureById.get(thread.fixtureId);
    const versionId = thread.status === "watchlist"
      ? thread.currentVersionId
      : thread.finalVersionId ?? thread.currentVersionId;
    const version = versionId ? versionById.get(versionId) : undefined;
    if (!fixture || !version || version.researchOnly) return [];
    return [{
      threadId: thread.id,
      fixtureId: fixture.id,
      leagueLabel: thread.leagueLabel,
      market: thread.market,
      status: thread.status,
      kickoffAt: fixture.kickoffAt,
      fixtureStatus: fixture.status,
      homeTeamName: teamById.get(fixture.homeTeamId)?.name ?? fixture.homeTeamId,
      awayTeamName: teamById.get(fixture.awayTeamId)?.name ?? fixture.awayTeamId,
      homeScore: fixture.homeScore,
      awayScore: fixture.awayScore,
      saved: savedThreadIds.has(thread.id),
      withdrawalReason: withdrawalByThread.get(thread.id)?.reasonText ?? null,
      version: toAnalysisVersion(version),
      value: valueByVersionId.get(version.id) ?? null,
    }];
  }).sort((first, second) => Date.parse(first.kickoffAt) - Date.parse(second.kickoffAt));
}

async function loadPublishedPerformanceRecords() {
  const db = await getDb();
  const publicationRows = await db.select().from(predictionEvents)
    .where(eq(predictionEvents.eventType, "finalized"))
    .orderBy(desc(predictionEvents.occurredAt));
  const versionIds = publicationRows.flatMap((publication) => publication.versionId ? [publication.versionId] : []);
  if (!versionIds.length) return [];
  const versionRows = await db.select().from(predictionVersions)
    .where(inArray(predictionVersions.id, versionIds));
  const publicVersions = versionRows.filter((version) => !version.researchOnly && version.recommendationOutcome);
  if (!publicVersions.length) return [];
  const publicVersionIds = publicVersions.map((version) => version.id);
  const threadIds = [...new Set(publicVersions.map((version) => version.threadId))];
  const fixtureIds = [...new Set(publicVersions.map((version) => version.fixtureId))];
  const [threadRows, fixtureRows, settlementRows, timelineRows, valueRows] = await Promise.all([
    db.select().from(predictionThreads).where(inArray(predictionThreads.id, threadIds)),
    db.select().from(fixtures).where(inArray(fixtures.id, fixtureIds)),
    db.select().from(predictionSettlements)
      .where(inArray(predictionSettlements.finalVersionId, publicVersionIds)),
    db.select().from(predictionEvents).where(inArray(predictionEvents.threadId, threadIds))
      .orderBy(asc(predictionEvents.threadId), asc(predictionEvents.sequence)),
    db.select().from(predictionValueAssessments)
      .where(inArray(predictionValueAssessments.predictionVersionId, publicVersionIds)),
  ]);
  const teamIds = [...new Set(fixtureRows.flatMap((fixture) => [fixture.homeTeamId, fixture.awayTeamId]))];
  const teamRows = teamIds.length
    ? await db.select({ id: teams.id, name: teams.name }).from(teams).where(inArray(teams.id, teamIds))
    : [];
  const versionById = new Map(publicVersions.map((version) => [version.id, version]));
  const threadById = new Map(threadRows.map((thread) => [thread.id, thread]));
  const fixtureById = new Map(fixtureRows.map((fixture) => [fixture.id, fixture]));
  const teamById = new Map(teamRows.map((team) => [team.id, team.name]));
  const settlementByVersion = new Map(settlementRows.map((settlement) => [settlement.finalVersionId, settlement]));
  const valueByVersion = new Map(valueRows.map((value) => [
    value.predictionVersionId,
    toPublicValueAssessment(value),
  ]));
  const eventsByThread = new Map<string, typeof timelineRows>();
  for (const event of timelineRows) {
    eventsByThread.set(event.threadId, [...(eventsByThread.get(event.threadId) ?? []), event]);
  }

  return publicationRows.flatMap((publication) => {
    if (!publication.versionId) return [];
    const version = versionById.get(publication.versionId);
    if (!version || !version.recommendationOutcome) return [];
    const thread = threadById.get(version.threadId);
    const fixture = fixtureById.get(version.fixtureId);
    if (!thread || !fixture) return [];
    const timeline = eventsByThread.get(thread.id) ?? [];
    const nextFinal = timeline.find((event) => event.sequence > publication.sequence && event.eventType === "finalized");
    const withdrawal = timeline.find((event) => (
      event.sequence > publication.sequence
      && event.eventType === "withdrawn"
      && (!nextFinal || event.sequence < nextFinal.sequence)
    ));
    const settlement = settlementByVersion.get(version.id);
    const withdrawnBeforeKickoff = Boolean(
      withdrawal && Date.parse(withdrawal.occurredAt) < Date.parse(fixture.kickoffAt),
    );
    const resultStatus: SettlementStatus | "pending" = settlement?.settlementStatus
      ?? (withdrawnBeforeKickoff ? "withdrawn" : "pending");
    return [{
      id: publication.id,
      threadId: thread.id,
      versionId: version.id,
      versionNumber: version.versionNumber,
      fixtureId: fixture.id,
      leagueLabel: thread.leagueLabel,
      market: thread.market,
      homeTeamName: teamById.get(fixture.homeTeamId) ?? fixture.homeTeamId,
      awayTeamName: teamById.get(fixture.awayTeamId) ?? fixture.awayTeamId,
      kickoffAt: fixture.kickoffAt,
      publishedAt: publication.occurredAt,
      predictedOutcome: version.recommendationOutcome,
      probabilities: {
        home: version.probabilityHome,
        draw: version.probabilityDraw,
        away: version.probabilityAway,
      },
      confidence: version.confidence,
      dataCompleteness: version.dataCompleteness,
      lineupState: version.lineupState,
      resultStatus,
      actualOutcome: settlement?.actualOutcome ?? null,
      homeScore: settlement?.homeScore ?? fixture.homeScore,
      awayScore: settlement?.awayScore ?? fixture.awayScore,
      settledAt: settlement?.settledAt ?? null,
      withdrawalReason: withdrawal?.reasonText ?? null,
      withdrawalAt: withdrawal?.occurredAt ?? null,
      fingerprint: version.versionFingerprint,
      value: valueByVersion.get(version.id) ?? null,
    }];
  });
}

function toAnalysisVersion(version: typeof predictionVersions.$inferSelect) {
  return {
    id: version.id,
    versionNumber: version.versionNumber,
    predictionAt: version.predictionAt,
    featureCutoffAt: version.featureCutoffAt,
    predictedOutcome: version.predictedOutcome,
    recommendationOutcome: version.recommendationOutcome,
    probabilities: {
      home: version.probabilityHome,
      draw: version.probabilityDraw,
      away: version.probabilityAway,
    },
    baseProbabilities: version.baseProbabilityHome === null
      || version.baseProbabilityDraw === null
      || version.baseProbabilityAway === null
      ? null
      : {
        home: version.baseProbabilityHome,
        draw: version.baseProbabilityDraw,
        away: version.baseProbabilityAway,
      },
    confidence: version.confidence,
    dataCompleteness: version.dataCompleteness,
    lineupState: version.lineupState,
    context: {
      snapshotId: version.contextSnapshotId,
      engineSchemaVersion: version.contextEngineSchemaVersion,
      fingerprint: version.contextFingerprint,
      completeness: version.contextCompleteness,
      uncertaintyShrink: version.contextUncertaintyShrink,
      directionalLogit: version.contextDirectionalLogit,
      eligible: version.contextEligible,
      blockers: parseJson<string[]>(version.contextBlockerCodesJson, []),
    },
    versionFingerprint: version.versionFingerprint,
    odds: parseJson<Record<string, unknown> | null>(version.oddsJson, null),
  };
}

function toPublicVersion(version: typeof predictionVersions.$inferSelect) {
  return {
    ...toAnalysisVersion(version),
    trigger: version.trigger,
    supersedesVersionId: version.supersedesVersionId,
    createdAt: version.createdAt,
  };
}

function buildTeamForm(
  rows: Array<typeof fixtures.$inferSelect>,
  teamId: string,
  stats: Map<string, typeof teamMatchStats.$inferSelect>,
) {
  const matches = rows.filter((row) => row.homeTeamId === teamId || row.awayTeamId === teamId).slice(0, 10);
  const mapped = matches.map((fixture) => {
    const home = fixture.homeTeamId === teamId;
    const goalsFor = home ? fixture.homeScore ?? 0 : fixture.awayScore ?? 0;
    const goalsAgainst = home ? fixture.awayScore ?? 0 : fixture.homeScore ?? 0;
    const opponentId = home ? fixture.awayTeamId : fixture.homeTeamId;
    const ownStats = stats.get(`${fixture.id}|${teamId}`);
    const opponentStats = stats.get(`${fixture.id}|${opponentId}`);
    return {
      fixtureId: fixture.id,
      kickoffAt: fixture.kickoffAt,
      venue: home ? "home" as const : "away" as const,
      result: goalsFor > goalsAgainst ? "W" as const : goalsFor === goalsAgainst ? "D" as const : "L" as const,
      goalsFor,
      goalsAgainst,
      dominance: ownStats && opponentStats ? {
        shotsDiff: nullableDifference(ownStats.shots, opponentStats.shots),
        shotsOnTargetDiff: nullableDifference(ownStats.shotsOnTarget, opponentStats.shotsOnTarget),
        expectedGoalsDiff: nullableDifference(ownStats.expectedGoals, opponentStats.expectedGoals),
        dangerousAttacksDiff: nullableDifference(ownStats.dangerousAttacks, opponentStats.dangerousAttacks),
      } : null,
    };
  });
  return {
    last5: summarizeForm(mapped.slice(0, 5)),
    last10: summarizeForm(mapped),
    home: summarizeForm(mapped.filter((match) => match.venue === "home")),
    away: summarizeForm(mapped.filter((match) => match.venue === "away")),
    matches: mapped,
  };
}

function summarizeForm(rows: Array<{
  result: "W" | "D" | "L";
  goalsFor: number;
  goalsAgainst: number;
  dominance: { shotsDiff: number | null; shotsOnTargetDiff: number | null; expectedGoalsDiff: number | null; dangerousAttacksDiff: number | null } | null;
}>) {
  const wins = rows.filter((row) => row.result === "W").length;
  const draws = rows.filter((row) => row.result === "D").length;
  const losses = rows.length - wins - draws;
  return {
    sampleSize: rows.length,
    sequence: rows.map((row) => row.result),
    wins,
    draws,
    losses,
    pointsPerMatch: rows.length ? round((wins * 3 + draws) / rows.length, 3) : null,
    goalsFor: rows.reduce((sum, row) => sum + row.goalsFor, 0),
    goalsAgainst: rows.reduce((sum, row) => sum + row.goalsAgainst, 0),
    dominance: {
      shotsDiff: averageFinite(rows.map((row) => row.dominance?.shotsDiff ?? null)),
      shotsOnTargetDiff: averageFinite(rows.map((row) => row.dominance?.shotsOnTargetDiff ?? null)),
      expectedGoalsDiff: averageFinite(rows.map((row) => row.dominance?.expectedGoalsDiff ?? null)),
      dangerousAttacksDiff: averageFinite(rows.map((row) => row.dominance?.dangerousAttacksDiff ?? null)),
    },
  };
}

function involvesBoth(fixture: typeof fixtures.$inferSelect, firstTeamId: string, secondTeamId: string) {
  return (fixture.homeTeamId === firstTeamId && fixture.awayTeamId === secondTeamId)
    || (fixture.homeTeamId === secondTeamId && fixture.awayTeamId === firstTeamId);
}

function nullableDifference(first: number | null, second: number | null) {
  return Number.isFinite(first) && Number.isFinite(second) ? round(first! - second!, 3) : null;
}

function averageFinite(values: Array<number | null>) {
  const finite = values.filter((value): value is number => Number.isFinite(value));
  return finite.length ? round(finite.reduce((sum, value) => sum + value, 0) / finite.length, 3) : null;
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export type UserDashboardOverview = Awaited<ReturnType<typeof getUserDashboardOverview>>;
export type UserPerformanceHistory = Awaited<ReturnType<typeof getUserPerformanceHistory>>;
export type UserMatchAnalysis = NonNullable<Awaited<ReturnType<typeof getUserMatchAnalysis>>>;
