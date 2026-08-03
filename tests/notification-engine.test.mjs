import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPredictionNotificationIntent,
  deriveOutboxStatus,
  notificationEventKey,
  planNotificationChannels,
} from "../lib/notification-engine.ts";

test("a finalized value opportunity targets all members without changing model evidence", () => {
  const intent = buildPredictionNotificationIntent(input({
    sourceEventType: "finalized",
    recommendationEligible: true,
  }));
  assert.equal(intent?.eligible, true);
  assert.equal(intent?.eventType, "value_opportunity");
  assert.equal(intent?.audience, "all_members");
  assert.equal(intent?.payload.recommendationEligible, true);
});

test("research and non-material withdrawal events remain auditable but suppressed", () => {
  const research = buildPredictionNotificationIntent(input({
    sourceEventType: "finalized",
    researchOnly: true,
  }));
  assert.equal(research?.eligible, false);
  assert.equal(research?.suppressionCode, "RESEARCH_ONLY");

  const quietWithdrawal = buildPredictionNotificationIntent(input({
    sourceEventType: "withdrawn",
    immediateNotification: false,
  }));
  assert.equal(quietWithdrawal?.eligible, false);
  assert.equal(quietWithdrawal?.suppressionCode, "NON_MATERIAL_WITHDRAWAL");
});

test("material withdrawals are critical and only target watchers", () => {
  const intent = buildPredictionNotificationIntent(input({
    sourceEventType: "withdrawn",
    immediateNotification: true,
    reasonText: "Kesin kadro sonrası model yönü maddi biçimde değişti.",
  }));
  assert.equal(intent?.eligible, true);
  assert.equal(intent?.eventType, "prediction_withdrawn");
  assert.equal(intent?.audience, "watchers");
  assert.equal(intent?.priority, "critical");
});

test("channel routing distinguishes preferences, configuration and subscriptions", () => {
  const plans = planNotificationChannels("value_opportunity", preferences(), {
    browserPushConfigured: true,
    browserPushSubscriptionActive: false,
    telegramConfigured: false,
    telegramConnectionActive: false,
  });
  assert.deepEqual(plans, [
    { channel: "in_app", status: "ready" },
    { channel: "browser_push", status: "subscription_required" },
    { channel: "telegram", status: "configuration_required" },
  ]);
});

test("event preferences close every channel before delivery planning", () => {
  const plans = planNotificationChannels("prediction_withdrawn", {
    ...preferences(),
    predictionWithdrawnEnabled: false,
  }, {
    browserPushConfigured: true,
    browserPushSubscriptionActive: true,
    telegramConfigured: true,
    telegramConnectionActive: true,
  });
  assert.ok(plans.every((plan) => plan.status === "preference_disabled"));
});

test("outbox projection is deterministic for empty, partial and failed delivery sets", () => {
  assert.equal(deriveOutboxStatus(0, []), "suppressed");
  assert.equal(deriveOutboxStatus(1, [{ status: "pending" }]), "pending");
  assert.equal(deriveOutboxStatus(1, [{ status: "delivered" }]), "delivered");
  assert.equal(deriveOutboxStatus(1, [
    { status: "delivered" },
    { status: "configuration_required" },
  ]), "partial");
  assert.equal(deriveOutboxStatus(1, [{ status: "failed" }]), "failed");
  assert.equal(
    notificationEventKey("event-1", "final_analysis"),
    "notification-engine-v1:event-1:final_analysis",
  );
});

function preferences() {
  return {
    finalAnalysisEnabled: true,
    valueOpportunityEnabled: true,
    predictionWithdrawnEnabled: true,
    inAppEnabled: true,
    browserPushEnabled: true,
    telegramEnabled: true,
  };
}

function input(overrides = {}) {
  return {
    sourceEventId: "event-1",
    sourceEventType: "finalized",
    immediateNotification: false,
    threadId: "thread-1",
    versionId: "version-1",
    fixtureId: "fixture-1",
    leagueLabel: "Süper Lig",
    homeTeamName: "Ev Takımı",
    awayTeamName: "Deplasman Takımı",
    researchOnly: false,
    recommendationEligible: false,
    reasonText: "Durum güncellendi.",
    occurredAt: "2026-08-03T12:00:00.000Z",
    ...overrides,
  };
}
