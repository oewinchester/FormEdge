import { and, count, desc, eq, sql } from "drizzle-orm";
import type { ChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import {
  appMembers,
  betaWaitlistEntries,
  membershipEvents,
  userDashboardPreferences,
  userFeatureUsage,
  userProfiles,
  userRiskAssessments,
} from "@/db/schema";
import {
  CURRENT_TERMS_REVISION,
  MEMBERSHIP_POLICY_VERSION,
  PLAN_ENTITLEMENTS,
  RISK_ASSESSMENT_VERSION,
  evaluateRiskAssessment,
  normalizeWaitlistInput,
  resolveMembership,
  trialWindow,
  type RiskAssessmentAnswers,
} from "@/lib/membership-engine";
import { ModelLabValidationError } from "@/lib/model-lab";
import { ensureUserProductAccount } from "@/lib/user-account-store";
import type { AdminActor } from "@/lib/admin-data";

export type WaitlistInput = Parameters<typeof normalizeWaitlistInput>[0] & {
  website?: unknown;
};

export type OnboardingInput = {
  locale?: unknown;
  countryCode?: unknown;
  timezone?: unknown;
  defaultAnalysisView?: unknown;
  ageConfirmed?: unknown;
  responsibleUseConfirmed?: unknown;
  disposableFundsOnly?: unknown;
  termsAccepted?: unknown;
  answers?: unknown;
};

export class MembershipAccessError extends Error {
  constructor(
    public code: "BETA_ACCESS_REQUIRED" | "DAILY_ANALYSIS_LIMIT_REACHED",
    message: string,
    public details: { limit: number | null; used: number },
  ) {
    super(message);
    this.name = "MembershipAccessError";
  }
}

export async function submitBetaWaitlist(input: WaitlistInput) {
  if (typeof input.website === "string" && input.website.trim()) {
    return publicWaitlistReceipt();
  }
  const normalized = normalizeWaitlistInput(input);
  const db = await getDb();
  const [existing] = await db.select().from(betaWaitlistEntries)
    .where(eq(betaWaitlistEntries.email, normalized.email)).limit(1);
  const nowIso = new Date().toISOString();
  if (existing) {
    if (existing.status === "waitlisted") {
      await db.update(betaWaitlistEntries).set({
        displayName: normalized.displayName,
        locale: normalized.locale,
        countryCode: normalized.countryCode,
        ageConfirmed: true,
        responsibleUseConfirmed: true,
        privacyAcknowledged: true,
        termsRevision: normalized.termsRevision,
        updatedAt: nowIso,
      }).where(eq(betaWaitlistEntries.id, existing.id));
    }
    return publicWaitlistReceipt();
  }
  await db.insert(betaWaitlistEntries).values({
    id: crypto.randomUUID(),
    email: normalized.email,
    displayName: normalized.displayName,
    locale: normalized.locale,
    countryCode: normalized.countryCode,
    ageConfirmed: true,
    responsibleUseConfirmed: true,
    privacyAcknowledged: true,
    termsRevision: normalized.termsRevision,
    status: "waitlisted",
    source: "landing",
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  return publicWaitlistReceipt();
}

export async function getUserMembershipCenter(user: ChatGPTUser) {
  let { profile, preferences } = await ensureUserProductAccount(user);
  const db = await getDb();
  if (profile.subscriptionStatus === "trial"
    && profile.trialEndsAt
    && Date.parse(profile.trialEndsAt) <= Date.now()) {
    await reconcileExpiredTrial(profile);
    const refreshed = await ensureUserProductAccount(user);
    profile = refreshed.profile;
    preferences = refreshed.preferences;
  }
  const [[internalMember], [waitlist], assessments, events] = await Promise.all([
    db.select({ status: appMembers.status, role: appMembers.role }).from(appMembers)
      .where(eq(appMembers.email, user.email)).limit(1),
    db.select({
      status: betaWaitlistEntries.status,
      createdAt: betaWaitlistEntries.createdAt,
      invitedAt: betaWaitlistEntries.invitedAt,
      acceptedAt: betaWaitlistEntries.acceptedAt,
    }).from(betaWaitlistEntries).where(eq(betaWaitlistEntries.email, user.email.toLowerCase())).limit(1),
    db.select().from(userRiskAssessments).where(eq(userRiskAssessments.userEmail, user.email))
      .orderBy(desc(userRiskAssessments.createdAt)).limit(6),
    db.select().from(membershipEvents).where(eq(membershipEvents.userEmail, user.email))
      .orderBy(desc(membershipEvents.occurredAt)).limit(12),
  ]);
  const membership = resolveForProfile(profile, internalMember?.status === "active");
  return {
    generatedAt: new Date().toISOString(),
    profile: {
      email: profile.email,
      displayName: profile.displayName,
      locale: profile.locale,
      countryCode: profile.countryCode,
      riskProfile: profile.riskProfile,
      riskAssessmentStatus: profile.riskAssessmentStatus,
      onboardingStatus: profile.onboardingStatus,
      onboardingCompletedAt: profile.onboardingCompletedAt,
      responsibleUseAcknowledgedAt: profile.responsibleUseAcknowledgedAt,
      termsRevision: profile.termsRevision,
    },
    preferences: {
      defaultAnalysisView: preferences.defaultAnalysisView,
      timezone: preferences.timezone,
    },
    membership,
    waitlist: waitlist ?? null,
    latestAssessment: assessments[0] ? publicAssessment(assessments[0]) : null,
    assessmentHistory: assessments.map(publicAssessment),
    events: events.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      fromPlan: event.fromPlan,
      toPlan: event.toPlan,
      fromSubscriptionStatus: event.fromSubscriptionStatus,
      toSubscriptionStatus: event.toSubscriptionStatus,
      reasonCode: event.reasonCode,
      occurredAt: event.occurredAt,
    })),
    plans: PLAN_ENTITLEMENTS,
    policy: {
      membershipPolicyVersion: MEMBERSHIP_POLICY_VERSION,
      riskAssessmentVersion: RISK_ASSESSMENT_VERSION,
      termsRevision: CURRENT_TERMS_REVISION,
      cardRequiredDuringBeta: false,
      trialHours: 72,
      probabilitiesAffectedByRiskProfile: false,
      externalIdentity: {
        current: "sign_in_with_chatgpt" as const,
        planned: ["google", "apple", "email_password"] as const,
        status: "external_identity_provider_required" as const,
      },
    },
  };
}

export async function completeUserOnboarding(user: ChatGPTUser, input: OnboardingInput) {
  const { profile } = await ensureUserProductAccount(user);
  if (profile.onboardingStatus === "completed") {
    throw new ModelLabValidationError("Onboarding daha önce tamamlandı; profil değişikliği ayrı bir işlem olmalıdır.");
  }
  const locale = input.locale === "tr" || input.locale === "en" ? input.locale : null;
  if (!locale) throw new ModelLabValidationError("Dil seçimi geçersizdir.");
  const countryCode = typeof input.countryCode === "string" ? input.countryCode.trim().toUpperCase() : "";
  if (!/^[A-Z]{2}$/.test(countryCode)) throw new ModelLabValidationError("İki harfli ülke kodu gereklidir.");
  const timezone = typeof input.timezone === "string" ? input.timezone.trim() : "";
  if (!timezone || timezone.length > 80) throw new ModelLabValidationError("Geçerli bir saat dilimi gereklidir.");
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format(new Date());
  } catch {
    throw new ModelLabValidationError("Saat dilimi IANA biçiminde geçerli olmalıdır.");
  }
  const defaultAnalysisView = input.defaultAnalysisView === "quick" || input.defaultAnalysisView === "detailed"
    ? input.defaultAnalysisView
    : null;
  if (!defaultAnalysisView) throw new ModelLabValidationError("Analiz görünümü geçersizdir.");
  if (input.ageConfirmed !== true) throw new ModelLabValidationError("18 yaş veya üzeri olduğunuzu doğrulamalısınız.");
  if (input.responsibleUseConfirmed !== true) throw new ModelLabValidationError("Sorumlu kullanım sınırını kabul etmelisiniz.");
  if (input.disposableFundsOnly !== true) throw new ModelLabValidationError("Yalnız kaybetmeyi göze alabileceğiniz bütçeyi kullanacağınızı doğrulamalısınız.");
  if (input.termsAccepted !== true) throw new ModelLabValidationError("Beta kullanım koşullarını kabul etmelisiniz.");
  const answers = input.answers as RiskAssessmentAnswers;
  const result = evaluateRiskAssessment(answers);
  const nowIso = new Date().toISOString();
  const assessmentId = crypto.randomUUID();
  const db = await getDb();
  await db.batch([
    db.insert(userRiskAssessments).values({
      id: assessmentId,
      userEmail: user.email,
      schemaVersion: result.schemaVersion,
      answersJson: JSON.stringify(answers),
      score: result.score,
      rawProfile: result.rawProfile,
      resultProfile: result.profile,
      safetyOverride: result.safetyOverride,
      safetyFlagsJson: JSON.stringify(result.safetyFlags),
      createdAt: nowIso,
    }),
    db.update(userProfiles).set({
      locale,
      countryCode,
      riskProfile: result.profile,
      riskAssessmentStatus: "completed",
      onboardingStatus: "completed",
      ageEligibilityAcknowledgedAt: nowIso,
      responsibleUseAcknowledgedAt: nowIso,
      termsAcceptedAt: nowIso,
      termsRevision: CURRENT_TERMS_REVISION,
      onboardingCompletedAt: nowIso,
      updatedAt: nowIso,
    }).where(eq(userProfiles.email, user.email)),
    db.update(userDashboardPreferences).set({
      timezone,
      defaultAnalysisView,
      updatedAt: nowIso,
    }).where(eq(userDashboardPreferences.userEmail, user.email)),
    db.insert(membershipEvents).values({
      id: crypto.randomUUID(),
      userEmail: user.email,
      eventType: "onboarding_completed",
      fromPlan: profile.plan,
      toPlan: profile.plan,
      fromSubscriptionStatus: profile.subscriptionStatus,
      toSubscriptionStatus: profile.subscriptionStatus,
      actorEmail: user.email,
      reasonCode: result.safetyOverride ? "ONBOARDING_SAFETY_LIMIT" : "ONBOARDING_COMPLETED",
      idempotencyKey: `${MEMBERSHIP_POLICY_VERSION}:onboarding:${user.email}`,
      metadataJson: JSON.stringify({ assessmentId, safetyFlags: result.safetyFlags }),
      occurredAt: nowIso,
    }).onConflictDoNothing({ target: membershipEvents.idempotencyKey }),
  ]);
  return getUserMembershipCenter(user);
}

export async function startCardlessProTrial(user: ChatGPTUser) {
  const before = await getUserMembershipCenter(user);
  if (before.membership.isInternalTester) {
    throw new ModelLabValidationError("İç test hesapları zaten Expert yetkileriyle çalışır.");
  }
  if (before.membership.trial.state !== "eligible") {
    throw new ModelLabValidationError("Bu hesap için üç günlük Pro denemesi uygun değil veya daha önce kullanıldı.");
  }
  const nowIso = new Date().toISOString();
  const window = trialWindow(nowIso);
  const db = await getDb();
  await db.batch([
    db.update(userProfiles).set({
      plan: "pro",
      subscriptionStatus: "trial",
      trialStartedAt: window.startedAt,
      trialEndsAt: window.endsAt,
      updatedAt: nowIso,
    }).where(eq(userProfiles.email, user.email)),
    db.insert(membershipEvents).values({
      id: crypto.randomUUID(),
      userEmail: user.email,
      eventType: "trial_started",
      fromPlan: before.membership.storedPlan,
      toPlan: "pro",
      fromSubscriptionStatus: before.membership.subscriptionStatus,
      toSubscriptionStatus: "trial",
      actorEmail: user.email,
      reasonCode: "CARDLESS_BETA_TRIAL",
      idempotencyKey: `${MEMBERSHIP_POLICY_VERSION}:trial-start:${user.email}`,
      metadataJson: JSON.stringify({ endsAt: window.endsAt, cardRequired: false }),
      occurredAt: nowIso,
    }).onConflictDoNothing({ target: membershipEvents.idempotencyKey }),
  ]);
  return getUserMembershipCenter(user);
}

export async function authorizeMatchAnalysisView(user: ChatGPTUser, fixtureId: string) {
  if (!fixtureId.trim()) throw new ModelLabValidationError("A fixture id is required.");
  const center = await getUserMembershipCenter(user);
  const limit = center.membership.entitlements.dailyAnalysisLimit;
  if (!center.membership.productAccess) {
    throw new MembershipAccessError(
      "BETA_ACCESS_REQUIRED",
      "Bu hesap için davetli beta erişimi henüz açık değil.",
      { limit, used: 0 },
    );
  }
  if (limit === null) {
    return {
      allowed: true as const,
      effectivePlan: center.membership.effectivePlan,
      detailedAnalysis: center.membership.entitlements.detailedAnalysis,
      expertStatistics: center.membership.entitlements.expertStatistics,
      limit: null,
      used: null,
      remaining: null,
      reused: false,
    };
  }
  const db = await getDb();
  const usageDay = dayKey(new Date(), center.preferences.timezone);
  const [existing] = await db.select({ id: userFeatureUsage.id }).from(userFeatureUsage).where(and(
    eq(userFeatureUsage.userEmail, user.email),
    eq(userFeatureUsage.feature, "match_analysis"),
    eq(userFeatureUsage.usageDay, usageDay),
    eq(userFeatureUsage.resourceId, fixtureId.trim()),
  )).limit(1);
  if (existing) {
    const [{ total }] = await db.select({ total: count() }).from(userFeatureUsage).where(and(
      eq(userFeatureUsage.userEmail, user.email),
      eq(userFeatureUsage.feature, "match_analysis"),
      eq(userFeatureUsage.usageDay, usageDay),
    ));
    const used = Number(total ?? 0);
    return {
      allowed: true as const,
      effectivePlan: center.membership.effectivePlan,
      detailedAnalysis: center.membership.entitlements.detailedAnalysis,
      expertStatistics: center.membership.entitlements.expertStatistics,
      limit,
      used,
      remaining: Math.max(0, limit - used),
      reused: true,
    };
  }
  const usageId = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  await db.run(sql`
    INSERT INTO user_feature_usage (id, user_email, feature, usage_day, resource_id, created_at)
    SELECT ${usageId}, ${user.email}, 'match_analysis', ${usageDay}, ${fixtureId.trim()}, ${nowIso}
    WHERE (
      SELECT COUNT(*) FROM user_feature_usage
      WHERE user_email = ${user.email}
        AND feature = 'match_analysis'
        AND usage_day = ${usageDay}
    ) < ${limit}
    ON CONFLICT(user_email, feature, usage_day, resource_id) DO NOTHING
  `);
  const [[inserted], [{ total }]] = await Promise.all([
    db.select({ id: userFeatureUsage.id }).from(userFeatureUsage).where(eq(userFeatureUsage.id, usageId)).limit(1),
    db.select({ total: count() }).from(userFeatureUsage).where(and(
      eq(userFeatureUsage.userEmail, user.email),
      eq(userFeatureUsage.feature, "match_analysis"),
      eq(userFeatureUsage.usageDay, usageDay),
    )),
  ]);
  const used = Number(total ?? 0);
  if (!inserted) {
    throw new MembershipAccessError(
      "DAILY_ANALYSIS_LIMIT_REACHED",
      `Free paket günlük ${limit} farklı maç analiziyle sınırlıdır.`,
      { limit, used },
    );
  }
  return {
    allowed: true as const,
    effectivePlan: center.membership.effectivePlan,
    detailedAnalysis: center.membership.entitlements.detailedAnalysis,
    expertStatistics: center.membership.entitlements.expertStatistics,
    limit,
    used,
    remaining: Math.max(0, limit - used),
    reused: false,
  };
}

export async function getAdminMembershipOverview(actor: AdminActor) {
  const db = await getDb();
  const [waitlistGroups, accessGroups, planGroups, onboardingGroups, waitlist, profiles, internalRows] = await Promise.all([
    db.select({ status: betaWaitlistEntries.status, total: count() }).from(betaWaitlistEntries)
      .groupBy(betaWaitlistEntries.status),
    db.select({ status: userProfiles.betaAccessStatus, total: count() }).from(userProfiles)
      .groupBy(userProfiles.betaAccessStatus),
    db.select({ plan: userProfiles.plan, total: count() }).from(userProfiles)
      .groupBy(userProfiles.plan),
    db.select({ status: userProfiles.onboardingStatus, total: count() }).from(userProfiles)
      .groupBy(userProfiles.onboardingStatus),
    db.select().from(betaWaitlistEntries).orderBy(desc(betaWaitlistEntries.createdAt)).limit(80),
    db.select().from(userProfiles).orderBy(desc(userProfiles.createdAt)).limit(80),
    db.select({ email: appMembers.email }).from(appMembers).where(eq(appMembers.status, "active")),
  ]);
  const internalEmails = new Set(internalRows.map((row) => row.email));
  return {
    generatedAt: new Date().toISOString(),
    actor,
    counts: {
      waitlist: groupedCounts(waitlistGroups),
      access: groupedCounts(accessGroups),
      plans: groupedCounts(planGroups),
      onboarding: groupedCounts(onboardingGroups),
    },
    waitlist: waitlist.map((row) => ({
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      locale: row.locale,
      countryCode: row.countryCode,
      status: row.status,
      createdAt: row.createdAt,
      invitedAt: row.invitedAt,
    })),
    members: profiles.map((profile) => ({
      email: profile.email,
      displayName: profile.displayName,
      storedPlan: profile.plan,
      subscriptionStatus: profile.subscriptionStatus,
      betaAccessStatus: internalEmails.has(profile.email) ? "active" as const : profile.betaAccessStatus,
      onboardingStatus: profile.onboardingStatus,
      riskProfile: profile.riskProfile,
      lastSeenAt: profile.lastSeenAt,
      internalTester: internalEmails.has(profile.email),
    })),
    policy: {
      membershipPolicyVersion: MEMBERSHIP_POLICY_VERSION,
      plans: PLAN_ENTITLEMENTS,
      publicIdentityProviderReady: false,
      invitationsEnabled: false,
      cardlessTrialEnabled: true,
      targetBetaSize: { minimum: 100, maximum: 300 },
    },
  };
}

async function reconcileExpiredTrial(profile: typeof userProfiles.$inferSelect) {
  if (!profile.trialEndsAt) return;
  const db = await getDb();
  const nowIso = new Date().toISOString();
  await db.batch([
    db.update(userProfiles).set({
      plan: "free",
      subscriptionStatus: "beta",
      updatedAt: nowIso,
    }).where(eq(userProfiles.email, profile.email)),
    db.insert(membershipEvents).values({
      id: crypto.randomUUID(),
      userEmail: profile.email,
      eventType: "trial_expired",
      fromPlan: profile.plan,
      toPlan: "free",
      fromSubscriptionStatus: profile.subscriptionStatus,
      toSubscriptionStatus: "beta",
      actorEmail: "system@formedge.local",
      reasonCode: "TRIAL_WINDOW_ENDED",
      idempotencyKey: `${MEMBERSHIP_POLICY_VERSION}:trial-expired:${profile.email}:${profile.trialEndsAt}`,
      metadataJson: JSON.stringify({ endedAt: profile.trialEndsAt }),
      occurredAt: nowIso,
    }).onConflictDoNothing({ target: membershipEvents.idempotencyKey }),
  ]);
}

function resolveForProfile(profile: typeof userProfiles.$inferSelect, isInternalTester: boolean) {
  return resolveMembership({
    storedPlan: profile.plan,
    subscriptionStatus: profile.subscriptionStatus,
    betaAccessStatus: profile.betaAccessStatus,
    onboardingCompleted: profile.onboardingStatus === "completed"
      && profile.riskAssessmentStatus === "completed"
      && Boolean(profile.ageEligibilityAcknowledgedAt)
      && Boolean(profile.responsibleUseAcknowledgedAt)
      && Boolean(profile.termsAcceptedAt),
    trialStartedAt: profile.trialStartedAt,
    trialEndsAt: profile.trialEndsAt,
    isInternalTester,
  });
}

function publicAssessment(row: typeof userRiskAssessments.$inferSelect) {
  return {
    id: row.id,
    schemaVersion: row.schemaVersion,
    score: row.score,
    rawProfile: row.rawProfile,
    resultProfile: row.resultProfile,
    safetyOverride: row.safetyOverride,
    safetyFlags: parseJson<string[]>(row.safetyFlagsJson, []),
    createdAt: row.createdAt,
  };
}

function publicWaitlistReceipt() {
  return {
    status: "recorded" as const,
    message: "Talebiniz kaydedildi. Davetler uygunluk ve kapasiteye göre gönderilecektir.",
    membershipPolicyVersion: MEMBERSHIP_POLICY_VERSION,
  };
}

function groupedCounts(rows: Array<Record<string, unknown> & { total: number }>) {
  const result: Record<string, number> = {};
  for (const row of rows) {
    const key = Object.entries(row).find(([name]) => name !== "total")?.[1];
    if (typeof key === "string") result[key] = Number(row.total);
  }
  return result;
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function dayKey(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

export type UserMembershipCenter = Awaited<ReturnType<typeof getUserMembershipCenter>>;
export type AdminMembershipOverview = Awaited<ReturnType<typeof getAdminMembershipOverview>>;
