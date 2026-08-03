import assert from "node:assert/strict";
import test from "node:test";
import {
  CARDLESS_TRIAL_HOURS,
  PLAN_ENTITLEMENTS,
  evaluateRiskAssessment,
  hasMembershipFeature,
  normalizeWaitlistInput,
  resolveMembership,
  trialWindow,
} from "../lib/membership-engine.ts";

test("risk scoring is deterministic and safety answers never increase risk", () => {
  const balanced = evaluateRiskAssessment(answers({
    volatilityComfort: "medium",
    selectionStyle: "balanced_coupon",
    stakeMethod: "quarter_kelly",
    losingStreakResponse: "keep_limits",
    primaryGoal: "balanced_process",
  }));
  assert.equal(balanced.score, 5);
  assert.equal(balanced.profile, "balanced");
  assert.equal(balanced.safetyOverride, false);

  const unsafe = evaluateRiskAssessment(answers({
    volatilityComfort: "high",
    selectionStyle: "high_odds_coupon",
    stakeMethod: "variable_high",
    losingStreakResponse: "increase_stake",
    primaryGoal: "maximize_return",
  }));
  assert.equal(unsafe.rawProfile, "bold");
  assert.equal(unsafe.profile, "cautious");
  assert.equal(unsafe.safetyOverride, true);
  assert.deepEqual(unsafe.safetyFlags, ["LOSS_CHASING_RESPONSE", "UNBOUNDED_STAKE_RESPONSE"]);
});

test("cardless trial lasts exactly 72 hours and resolves to Pro only while active", () => {
  const window = trialWindow("2026-08-03T12:00:00.000Z");
  assert.equal(Date.parse(window.endsAt) - Date.parse(window.startedAt), CARDLESS_TRIAL_HOURS * 3_600_000);
  const active = resolveMembership(baseMembership({
    subscriptionStatus: "trial",
    trialStartedAt: window.startedAt,
    trialEndsAt: window.endsAt,
    now: "2026-08-05T12:00:00.000Z",
  }));
  assert.equal(active.effectivePlan, "pro");
  assert.equal(active.trial.state, "active");
  assert.ok(active.trial.remainingSeconds > 0);

  const expired = resolveMembership(baseMembership({
    subscriptionStatus: "trial",
    trialStartedAt: window.startedAt,
    trialEndsAt: window.endsAt,
    now: "2026-08-07T12:00:00.000Z",
  }));
  assert.equal(expired.effectivePlan, "free");
  assert.equal(expired.trial.state, "expired");
});

test("access and plan gates keep Free, Pro and Expert capabilities distinct", () => {
  const pending = resolveMembership(baseMembership({ betaAccessStatus: "pending" }));
  assert.equal(pending.productAccess, false);
  assert.equal(hasMembershipFeature(pending, "quick_analysis"), false);

  const free = resolveMembership(baseMembership());
  assert.equal(free.entitlements.dailyAnalysisLimit, 3);
  assert.equal(hasMembershipFeature(free, "detailed_analysis"), false);
  assert.equal(hasMembershipFeature(free, "csv_export"), false);

  const pro = resolveMembership(baseMembership({ storedPlan: "pro", subscriptionStatus: "active" }));
  assert.equal(hasMembershipFeature(pro, "detailed_analysis"), true);
  assert.equal(hasMembershipFeature(pro, "balanced_coupons"), true);
  assert.equal(hasMembershipFeature(pro, "high_odds_coupons"), false);

  const expert = resolveMembership(baseMembership({ isInternalTester: true }));
  assert.equal(expert.effectivePlan, "expert");
  assert.equal(hasMembershipFeature(expert, "telegram"), true);
  assert.equal(expert.entitlements, PLAN_ENTITLEMENTS.expert);
});

test("waitlist normalization is strict, minimal and idempotency friendly", () => {
  const normalized = normalizeWaitlistInput({
    email: "  USER@Example.COM ",
    displayName: " Ada ",
    locale: "tr",
    countryCode: "tr",
    ageConfirmed: true,
    responsibleUseConfirmed: true,
    privacyAcknowledged: true,
  });
  assert.equal(normalized.email, "user@example.com");
  assert.equal(normalized.displayName, "Ada");
  assert.equal(normalized.countryCode, "TR");
  assert.throws(() => normalizeWaitlistInput({
    ...normalized,
    email: "invalid",
  }), /e-posta/i);
});

function answers(overrides = {}) {
  return {
    volatilityComfort: "low",
    selectionStyle: "single",
    stakeMethod: "fixed_low",
    losingStreakResponse: "pause_and_review",
    primaryGoal: "preserve_bankroll",
    ...overrides,
  };
}

function baseMembership(overrides = {}) {
  return {
    storedPlan: "free",
    subscriptionStatus: "beta",
    betaAccessStatus: "active",
    onboardingCompleted: true,
    trialStartedAt: null,
    trialEndsAt: null,
    now: "2026-08-03T12:00:00.000Z",
    ...overrides,
  };
}
