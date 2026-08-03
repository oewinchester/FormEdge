export const NOTIFICATION_ENGINE_SCHEMA_VERSION = "notification-engine-v1" as const;

export const NOTIFICATION_EVENT_TYPES = [
  "final_analysis",
  "value_opportunity",
  "prediction_withdrawn",
] as const;

export const NOTIFICATION_CHANNELS = [
  "in_app",
  "browser_push",
  "telegram",
] as const;

export type NotificationEventType = typeof NOTIFICATION_EVENT_TYPES[number];
export type NotificationChannel = typeof NOTIFICATION_CHANNELS[number];
export type NotificationAudience = "watchers" | "all_members";
export type NotificationPriority = "normal" | "high" | "critical";

export type NotificationPreferences = {
  finalAnalysisEnabled: boolean;
  valueOpportunityEnabled: boolean;
  predictionWithdrawnEnabled: boolean;
  inAppEnabled: boolean;
  browserPushEnabled: boolean;
  telegramEnabled: boolean;
};

export type ChannelCapabilities = {
  browserPushConfigured: boolean;
  browserPushSubscriptionActive: boolean;
  telegramConfigured: boolean;
  telegramConnectionActive: boolean;
};

export type PredictionNotificationInput = {
  sourceEventId: string;
  sourceEventType: string;
  immediateNotification: boolean;
  threadId: string;
  versionId: string | null;
  fixtureId: string;
  leagueLabel: string;
  homeTeamName: string;
  awayTeamName: string;
  researchOnly: boolean;
  recommendationEligible: boolean;
  reasonText: string;
  occurredAt: string;
};

export type NotificationIntent = {
  eligible: boolean;
  suppressionCode: string | null;
  eventKey: string;
  eventType: NotificationEventType;
  audience: NotificationAudience;
  priority: NotificationPriority;
  title: string;
  body: string;
  href: string;
  payload: Record<string, unknown>;
};

export type ChannelPlan = {
  channel: NotificationChannel;
  status: "ready" | "preference_disabled" | "configuration_required" | "subscription_required";
};

export type DeliveryProjection = {
  status: "pending" | "delivered" | "failed" | "skipped" | "configuration_required";
};

export function buildPredictionNotificationIntent(
  input: PredictionNotificationInput,
): NotificationIntent | null {
  let eventType: NotificationEventType;
  let audience: NotificationAudience;
  let priority: NotificationPriority;
  let title: string;
  let body: string;

  if (input.sourceEventType === "finalized") {
    eventType = input.recommendationEligible ? "value_opportunity" : "final_analysis";
    audience = input.recommendationEligible ? "all_members" : "watchers";
    priority = input.recommendationEligible ? "high" : "normal";
    title = input.recommendationEligible
      ? "Yeni değer fırsatı finalleşti"
      : "İzlediğiniz maçın analizi finalleşti";
    body = `${input.homeTeamName} – ${input.awayTeamName} · ${input.leagueLabel}. ${
      input.recommendationEligible
        ? "Analiz ve bağımsız değer kapıları birlikte geçti."
        : "Kesin kadro ve yayın kapıları geçti; oran uygunluğu ayrıca değerlendirilir."
    }`;
  } else if (input.sourceEventType === "withdrawn") {
    eventType = "prediction_withdrawn";
    audience = "watchers";
    priority = "critical";
    title = "Final analiz geri çekildi";
    body = `${input.homeTeamName} – ${input.awayTeamName}: ${input.reasonText}`;
  } else {
    return null;
  }

  const suppressionCode = input.researchOnly
    ? "RESEARCH_ONLY"
    : input.sourceEventType === "withdrawn" && !input.immediateNotification
      ? "NON_MATERIAL_WITHDRAWAL"
      : null;

  return {
    eligible: suppressionCode === null,
    suppressionCode,
    eventKey: notificationEventKey(input.sourceEventId, eventType),
    eventType,
    audience,
    priority,
    title,
    body,
    href: `/dashboard/matches/${encodeURIComponent(input.fixtureId)}`,
    payload: {
      schemaVersion: NOTIFICATION_ENGINE_SCHEMA_VERSION,
      sourceEventId: input.sourceEventId,
      sourceEventType: input.sourceEventType,
      threadId: input.threadId,
      versionId: input.versionId,
      fixtureId: input.fixtureId,
      occurredAt: input.occurredAt,
      recommendationEligible: input.recommendationEligible,
      researchOnly: input.researchOnly,
    },
  };
}

export function planNotificationChannels(
  eventType: NotificationEventType,
  preferences: NotificationPreferences,
  capabilities: ChannelCapabilities,
): ChannelPlan[] {
  if (!eventPreferenceEnabled(eventType, preferences)) {
    return NOTIFICATION_CHANNELS.map((channel) => ({ channel, status: "preference_disabled" }));
  }

  return [
    {
      channel: "in_app",
      status: preferences.inAppEnabled ? "ready" : "preference_disabled",
    },
    {
      channel: "browser_push",
      status: !preferences.browserPushEnabled
        ? "preference_disabled"
        : !capabilities.browserPushConfigured
          ? "configuration_required"
          : capabilities.browserPushSubscriptionActive
            ? "ready"
            : "subscription_required",
    },
    {
      channel: "telegram",
      status: !preferences.telegramEnabled
        ? "preference_disabled"
        : !capabilities.telegramConfigured
          ? "configuration_required"
          : capabilities.telegramConnectionActive
            ? "ready"
            : "subscription_required",
    },
  ];
}

export function deriveOutboxStatus(
  recipientCount: number,
  deliveries: DeliveryProjection[],
): "pending" | "delivered" | "partial" | "failed" | "suppressed" {
  if (recipientCount === 0) return "suppressed";
  if (!deliveries.length || deliveries.some((delivery) => delivery.status === "pending")) return "pending";

  const delivered = deliveries.filter((delivery) => delivery.status === "delivered").length;
  const failed = deliveries.filter((delivery) => delivery.status === "failed").length;
  const blocked = deliveries.filter((delivery) => (
    delivery.status === "configuration_required" || delivery.status === "skipped"
  )).length;

  if (failed > 0 && delivered === 0) return "failed";
  if (failed > 0 || blocked > 0) return delivered > 0 ? "partial" : "failed";
  return delivered > 0 ? "delivered" : "failed";
}

export function notificationEventKey(
  sourceEventId: string,
  eventType: NotificationEventType,
) {
  return `${NOTIFICATION_ENGINE_SCHEMA_VERSION}:${sourceEventId}:${eventType}`;
}

function eventPreferenceEnabled(
  eventType: NotificationEventType,
  preferences: NotificationPreferences,
) {
  return eventType === "final_analysis"
    ? preferences.finalAnalysisEnabled
    : eventType === "value_opportunity"
      ? preferences.valueOpportunityEnabled
      : preferences.predictionWithdrawnEnabled;
}
