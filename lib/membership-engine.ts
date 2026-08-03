import { ModelLabValidationError } from "./model-lab.ts";

export const MEMBERSHIP_POLICY_VERSION = "membership-v1" as const;
export const RISK_ASSESSMENT_VERSION = "risk-profile-v1" as const;
export const CURRENT_TERMS_REVISION = "beta-2026-08" as const;
export const CARDLESS_TRIAL_HOURS = 72 as const;

export type MembershipPlan = "free" | "pro" | "expert";
export type BetaAccessStatus = "pending" | "invited" | "active" | "suspended";
export type SubscriptionStatus = "beta" | "trial" | "active" | "paused" | "cancelled";
export type RiskProfile = "cautious" | "balanced" | "bold";
export type MembershipFeature =
  | "quick_analysis"
  | "detailed_analysis"
  | "standard_history"
  | "expert_statistics"
  | "balanced_coupons"
  | "high_odds_coupons"
  | "csv_export"
  | "advanced_exports"
  | "browser_push"
  | "telegram";

export type PlanEntitlements = {
  dailyAnalysisLimit: number | null;
  historyDays: number | null;
  detailedAnalysis: boolean;
  expertStatistics: boolean;
  couponTiers: readonly ("balanced" | "high_odds")[];
  couponAlternativeLimit: number;
  exportFormats: readonly ("csv" | "xlsx" | "pdf" | "share_link")[];
  notificationChannels: readonly ("in_app" | "browser_push" | "telegram")[];
};

export const PLAN_ENTITLEMENTS: Record<MembershipPlan, PlanEntitlements> = {
  free: {
    dailyAnalysisLimit: 3,
    historyDays: 7,
    detailedAnalysis: false,
    expertStatistics: false,
    couponTiers: [],
    couponAlternativeLimit: 0,
    exportFormats: [],
    notificationChannels: ["in_app"],
  },
  pro: {
    dailyAnalysisLimit: null,
    historyDays: null,
    detailedAnalysis: true,
    expertStatistics: false,
    couponTiers: ["balanced"],
    couponAlternativeLimit: 2,
    exportFormats: ["csv"],
    notificationChannels: ["in_app", "browser_push"],
  },
  expert: {
    dailyAnalysisLimit: null,
    historyDays: null,
    detailedAnalysis: true,
    expertStatistics: true,
    couponTiers: ["balanced", "high_odds"],
    couponAlternativeLimit: 5,
    exportFormats: ["csv", "xlsx", "pdf", "share_link"],
    notificationChannels: ["in_app", "browser_push", "telegram"],
  },
};

export type RiskAssessmentAnswers = {
  volatilityComfort: "low" | "medium" | "high";
  selectionStyle: "single" | "balanced_coupon" | "high_odds_coupon";
  stakeMethod: "fixed_low" | "quarter_kelly" | "variable_high";
  losingStreakResponse: "pause_and_review" | "keep_limits" | "increase_stake";
  primaryGoal: "preserve_bankroll" | "balanced_process" | "maximize_return";
};

export type RiskAssessmentResult = {
  schemaVersion: typeof RISK_ASSESSMENT_VERSION;
  score: number;
  profile: RiskProfile;
  rawProfile: RiskProfile;
  safetyOverride: boolean;
  safetyFlags: readonly string[];
};

export type MembershipResolutionInput = {
  storedPlan: MembershipPlan;
  subscriptionStatus: SubscriptionStatus;
  betaAccessStatus: BetaAccessStatus;
  onboardingCompleted: boolean;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  isInternalTester?: boolean;
  now?: string;
};

export type MembershipResolution = {
  policyVersion: typeof MEMBERSHIP_POLICY_VERSION;
  storedPlan: MembershipPlan;
  effectivePlan: MembershipPlan;
  subscriptionStatus: SubscriptionStatus;
  accessStatus: BetaAccessStatus;
  productAccess: boolean;
  onboardingCompleted: boolean;
  trial: {
    state: "eligible" | "active" | "expired" | "used" | "blocked";
    startedAt: string | null;
    endsAt: string | null;
    remainingSeconds: number;
  };
  entitlements: PlanEntitlements;
  isInternalTester: boolean;
};

const SCORE_MAP = {
  volatilityComfort: { low: 0, medium: 1, high: 2 },
  selectionStyle: { single: 0, balanced_coupon: 1, high_odds_coupon: 2 },
  stakeMethod: { fixed_low: 0, quarter_kelly: 1, variable_high: 2 },
  losingStreakResponse: { pause_and_review: 0, keep_limits: 1, increase_stake: 2 },
  primaryGoal: { preserve_bankroll: 0, balanced_process: 1, maximize_return: 2 },
} as const;

export function evaluateRiskAssessment(answers: RiskAssessmentAnswers): RiskAssessmentResult {
  validateRiskAnswers(answers);
  const score = (
    SCORE_MAP.volatilityComfort[answers.volatilityComfort]
    + SCORE_MAP.selectionStyle[answers.selectionStyle]
    + SCORE_MAP.stakeMethod[answers.stakeMethod]
    + SCORE_MAP.losingStreakResponse[answers.losingStreakResponse]
    + SCORE_MAP.primaryGoal[answers.primaryGoal]
  );
  const rawProfile: RiskProfile = score <= 3 ? "cautious" : score <= 7 ? "balanced" : "bold";
  const safetyFlags: string[] = [];
  if (answers.losingStreakResponse === "increase_stake") safetyFlags.push("LOSS_CHASING_RESPONSE");
  if (answers.stakeMethod === "variable_high") safetyFlags.push("UNBOUNDED_STAKE_RESPONSE");
  const safetyOverride = safetyFlags.length > 0;
  return {
    schemaVersion: RISK_ASSESSMENT_VERSION,
    score,
    rawProfile,
    profile: safetyOverride ? "cautious" : rawProfile,
    safetyOverride,
    safetyFlags,
  };
}

export function resolveMembership(input: MembershipResolutionInput): MembershipResolution {
  const nowMs = parseIso(input.now ?? new Date().toISOString(), "now");
  const trialStartedMs = input.trialStartedAt ? parseIso(input.trialStartedAt, "trialStartedAt") : null;
  const trialEndsMs = input.trialEndsAt ? parseIso(input.trialEndsAt, "trialEndsAt") : null;
  if ((trialStartedMs === null) !== (trialEndsMs === null)) {
    throw new ModelLabValidationError("Trial start and end must either both exist or both be null.");
  }
  if (trialStartedMs !== null && trialEndsMs !== null && trialEndsMs <= trialStartedMs) {
    throw new ModelLabValidationError("Trial end must be later than trial start.");
  }

  const isInternalTester = input.isInternalTester === true;
  const productAccess = isInternalTester
    || (input.betaAccessStatus === "active" && input.onboardingCompleted);
  const trialActive = input.subscriptionStatus === "trial"
    && trialEndsMs !== null
    && trialEndsMs > nowMs;
  const trialExpired = trialEndsMs !== null && trialEndsMs <= nowMs;
  let effectivePlan: MembershipPlan = "free";
  if (isInternalTester) effectivePlan = "expert";
  else if (productAccess && trialActive) effectivePlan = "pro";
  else if (productAccess && input.subscriptionStatus === "active") effectivePlan = input.storedPlan;
  else if (productAccess && input.subscriptionStatus === "beta") effectivePlan = input.storedPlan;

  let trialState: MembershipResolution["trial"]["state"] = "blocked";
  if (trialActive) trialState = "active";
  else if (trialExpired) trialState = "expired";
  else if (trialStartedMs !== null) trialState = "used";
  else if (productAccess && input.onboardingCompleted && !isInternalTester) trialState = "eligible";

  return {
    policyVersion: MEMBERSHIP_POLICY_VERSION,
    storedPlan: input.storedPlan,
    effectivePlan,
    subscriptionStatus: input.subscriptionStatus,
    accessStatus: isInternalTester ? "active" : input.betaAccessStatus,
    productAccess,
    onboardingCompleted: input.onboardingCompleted,
    trial: {
      state: trialState,
      startedAt: input.trialStartedAt,
      endsAt: input.trialEndsAt,
      remainingSeconds: trialActive && trialEndsMs !== null
        ? Math.max(0, Math.ceil((trialEndsMs - nowMs) / 1_000))
        : 0,
    },
    entitlements: PLAN_ENTITLEMENTS[effectivePlan],
    isInternalTester,
  };
}

export function trialWindow(startedAt: string) {
  const startedMs = parseIso(startedAt, "startedAt");
  return {
    startedAt: new Date(startedMs).toISOString(),
    endsAt: new Date(startedMs + CARDLESS_TRIAL_HOURS * 60 * 60 * 1_000).toISOString(),
  };
}

export function hasMembershipFeature(
  membership: Pick<MembershipResolution, "productAccess" | "entitlements">,
  feature: MembershipFeature,
): boolean {
  if (!membership.productAccess) return false;
  const entitlements = membership.entitlements;
  if (feature === "quick_analysis" || feature === "standard_history") return true;
  if (feature === "detailed_analysis") return entitlements.detailedAnalysis;
  if (feature === "expert_statistics") return entitlements.expertStatistics;
  if (feature === "balanced_coupons") return entitlements.couponTiers.includes("balanced");
  if (feature === "high_odds_coupons") return entitlements.couponTiers.includes("high_odds");
  if (feature === "csv_export") return entitlements.exportFormats.includes("csv");
  if (feature === "advanced_exports") return entitlements.exportFormats.some((format) => format !== "csv");
  if (feature === "browser_push") return entitlements.notificationChannels.includes("browser_push");
  return entitlements.notificationChannels.includes("telegram");
}

export function normalizeWaitlistInput(input: {
  email?: unknown;
  displayName?: unknown;
  locale?: unknown;
  countryCode?: unknown;
  ageConfirmed?: unknown;
  responsibleUseConfirmed?: unknown;
  privacyAcknowledged?: unknown;
}) {
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new ModelLabValidationError("Geçerli bir e-posta adresi gereklidir.");
  }
  const displayName = typeof input.displayName === "string" ? input.displayName.trim() : "";
  if (displayName.length > 80) throw new ModelLabValidationError("Ad alanı en fazla 80 karakter olabilir.");
  const locale: "tr" | "en" | null = input.locale === "en" ? "en" : input.locale === "tr" ? "tr" : null;
  if (!locale) throw new ModelLabValidationError("Dil seçimi geçersizdir.");
  const countryCode = typeof input.countryCode === "string" ? input.countryCode.trim().toUpperCase() : "";
  if (!/^[A-Z]{2}$/.test(countryCode)) throw new ModelLabValidationError("İki harfli ülke kodu gereklidir.");
  if (input.ageConfirmed !== true) throw new ModelLabValidationError("18 yaş veya üzeri olduğunuzu doğrulamalısınız.");
  if (input.responsibleUseConfirmed !== true) throw new ModelLabValidationError("Sorumlu kullanım sınırını kabul etmelisiniz.");
  if (input.privacyAcknowledged !== true) throw new ModelLabValidationError("Bekleme listesi veri bildirimini kabul etmelisiniz.");
  return {
    email,
    displayName: displayName || null,
    locale,
    countryCode,
    ageConfirmed: true as const,
    responsibleUseConfirmed: true as const,
    privacyAcknowledged: true as const,
    termsRevision: CURRENT_TERMS_REVISION,
  };
}

function validateRiskAnswers(answers: RiskAssessmentAnswers) {
  if (!answers || typeof answers !== "object") {
    throw new ModelLabValidationError("Risk assessment answers are required.");
  }
  for (const [key, options] of Object.entries(SCORE_MAP)) {
    if (!(String(answers[key as keyof RiskAssessmentAnswers]) in options)) {
      throw new ModelLabValidationError(`Risk assessment answer ${key} is invalid.`);
    }
  }
}

function parseIso(value: string, field: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new ModelLabValidationError(`${field} must be a valid ISO timestamp.`);
  return parsed;
}
