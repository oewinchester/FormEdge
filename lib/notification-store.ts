import {
  and,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import type { ChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import {
  browserPushSubscriptions,
  fixtures,
  notificationDeliveries,
  notificationOutbox,
  predictionEvents,
  predictionThreads,
  predictionVersions,
  teams,
  telegramConnections,
  userNotificationPreferences,
  userNotifications,
  userPredictionWatchlist,
  userProfiles,
} from "@/db/schema";
import type { AdminActor } from "@/lib/admin-data";
import { ModelLabValidationError } from "@/lib/model-lab";
import {
  NOTIFICATION_ENGINE_SCHEMA_VERSION,
  buildPredictionNotificationIntent,
  deriveOutboxStatus,
  planNotificationChannels,
  type ChannelCapabilities,
  type NotificationChannel,
  type NotificationPreferences,
} from "@/lib/notification-engine";
import { ensureUserProductAccount } from "@/lib/user-dashboard-store";

const MAX_DELIVERY_ATTEMPTS = 3;
const MAX_QUEUE_ATTEMPTS = 5;
const TELEGRAM_PAIRING_MINUTES = 10;

type RuntimeNotificationEnv = {
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_BOT_USERNAME?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
};

export type NotificationPreferencePatch = Partial<NotificationPreferences>;

export type PushSubscriptionInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string | null;
};

export async function getUserNotificationCenter(user: ChatGPTUser) {
  const account = await ensureUserProductAccount(user);
  const db = await getDb();
  const config = await getChannelConfiguration();
  const [preferenceRows, notificationRows, pushRows, telegramRows, unreadRows] = await Promise.all([
    db.select().from(userNotificationPreferences)
      .where(eq(userNotificationPreferences.userEmail, user.email)).limit(1),
    db.select().from(userNotifications)
      .where(eq(userNotifications.userEmail, user.email))
      .orderBy(desc(userNotifications.createdAt)).limit(100),
    db.select().from(browserPushSubscriptions).where(and(
      eq(browserPushSubscriptions.userEmail, user.email),
      eq(browserPushSubscriptions.status, "active"),
    )).orderBy(desc(browserPushSubscriptions.updatedAt)),
    db.select().from(telegramConnections)
      .where(eq(telegramConnections.userEmail, user.email)).limit(1),
    db.select({ total: count() }).from(userNotifications).where(and(
      eq(userNotifications.userEmail, user.email),
      isNull(userNotifications.readAt),
    )),
  ]);
  const preferences = toNotificationPreferences(preferenceRows[0]);
  const telegram = telegramRows[0] ?? null;
  const unread = Number(unreadRows[0]?.total ?? 0);

  return {
    generatedAt: new Date().toISOString(),
    profile: account.profile,
    counts: {
      total: notificationRows.length,
      unread,
      criticalUnread: notificationRows.filter((row) => row.readAt === null && row.priority === "critical").length,
    },
    preferences,
    channels: {
      inApp: {
        configured: true,
        enabled: preferences.inAppEnabled,
        connected: true,
      },
      browserPush: {
        configured: config.browserPush.configured,
        enabled: preferences.browserPushEnabled,
        connected: pushRows.length > 0,
        activeSubscriptionCount: pushRows.length,
        publicKey: config.browserPush.publicKey,
      },
      telegram: {
        configured: config.telegram.configured,
        enabled: preferences.telegramEnabled,
        connected: telegram?.status === "connected" && Boolean(telegram.chatId),
        status: telegram?.status ?? "disconnected",
        botUsername: config.telegram.botUsername,
        chatUsername: telegram?.chatUsername ?? null,
        pairingExpiresAt: telegram?.status === "pending" ? telegram.pairingExpiresAt : null,
      },
    },
    notifications: notificationRows.map((row) => ({
      id: row.id,
      eventType: row.eventType,
      priority: row.priority,
      title: row.title,
      body: row.body,
      href: row.href,
      readAt: row.readAt,
      createdAt: row.createdAt,
    })),
    policy: {
      schemaVersion: NOTIFICATION_ENGINE_SCHEMA_VERSION,
      researchOnlySuppressed: true,
      materialWithdrawalImmediate: true,
      inAppDeliveryActive: true,
      externalChannelsRequireRuntimeSecrets: true,
      deliveryAttempts: MAX_DELIVERY_ATTEMPTS,
    },
  };
}

export async function updateUserNotificationPreferences(
  user: ChatGPTUser,
  patch: NotificationPreferencePatch,
) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw new ModelLabValidationError("Bildirim tercihleri gereklidir.");
  }
  const allowed = new Set<keyof NotificationPreferences>([
    "finalAnalysisEnabled",
    "valueOpportunityEnabled",
    "predictionWithdrawnEnabled",
    "inAppEnabled",
    "browserPushEnabled",
    "telegramEnabled",
  ]);
  const entries = Object.entries(patch);
  if (!entries.length) throw new ModelLabValidationError("En az bir bildirim tercihi gönderilmelidir.");
  for (const [key, value] of entries) {
    if (!allowed.has(key as keyof NotificationPreferences) || typeof value !== "boolean") {
      throw new ModelLabValidationError(`Geçersiz bildirim tercihi: ${key}.`);
    }
  }
  await ensureUserProductAccount(user);
  const db = await getDb();
  const [currentRow] = await db.select().from(userNotificationPreferences)
    .where(eq(userNotificationPreferences.userEmail, user.email)).limit(1);
  const current = toNotificationPreferences(currentRow);
  const next = { ...current, ...patch };
  if (!next.inAppEnabled && !next.browserPushEnabled && !next.telegramEnabled) {
    throw new ModelLabValidationError("En az bir bildirim kanalı açık kalmalıdır.");
  }
  await db.update(userNotificationPreferences).set({ ...patch, updatedAt: new Date().toISOString() })
    .where(eq(userNotificationPreferences.userEmail, user.email));
  return next;
}

export async function markUserNotificationsRead(
  user: ChatGPTUser,
  input: { notificationId?: string; all?: boolean },
) {
  await ensureUserProductAccount(user);
  const db = await getDb();
  const nowIso = new Date().toISOString();
  if (input.all === true) {
    await db.update(userNotifications).set({ readAt: nowIso }).where(and(
      eq(userNotifications.userEmail, user.email),
      isNull(userNotifications.readAt),
    ));
    return { all: true, readAt: nowIso };
  }
  if (!input.notificationId?.trim()) {
    throw new ModelLabValidationError("notificationId veya all=true gereklidir.");
  }
  await db.update(userNotifications).set({ readAt: nowIso }).where(and(
    eq(userNotifications.id, input.notificationId.trim()),
    eq(userNotifications.userEmail, user.email),
  ));
  return { notificationId: input.notificationId.trim(), readAt: nowIso };
}

export async function saveBrowserPushSubscription(
  user: ChatGPTUser,
  input: PushSubscriptionInput,
) {
  const config = await getChannelConfiguration();
  if (!config.browserPush.configured) {
    throw new ModelLabValidationError("Tarayıcı push sunucu anahtarları henüz yapılandırılmadı.");
  }
  validatePushSubscription(input);
  await ensureUserProductAccount(user);
  const db = await getDb();
  const endpointHash = await sha256(input.endpoint);
  const nowIso = new Date().toISOString();
  await db.insert(browserPushSubscriptions).values({
    id: crypto.randomUUID(),
    userEmail: user.email,
    endpoint: input.endpoint,
    endpointHash,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
    status: "active",
    userAgent: input.userAgent?.slice(0, 400) ?? null,
    lastSeenAt: nowIso,
    updatedAt: nowIso,
  }).onConflictDoUpdate({
    target: browserPushSubscriptions.endpointHash,
    set: {
      userEmail: user.email,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      status: "active",
      userAgent: input.userAgent?.slice(0, 400) ?? null,
      failureCount: 0,
      lastErrorCode: null,
      lastSeenAt: nowIso,
      updatedAt: nowIso,
    },
  });
  await db.update(userNotificationPreferences).set({
    browserPushEnabled: true,
    updatedAt: nowIso,
  }).where(eq(userNotificationPreferences.userEmail, user.email));
  return { endpointHash, status: "active" as const };
}

export async function revokeBrowserPushSubscription(
  user: ChatGPTUser,
  endpoint: string,
) {
  if (!endpoint.trim()) throw new ModelLabValidationError("Push endpoint gereklidir.");
  await ensureUserProductAccount(user);
  const db = await getDb();
  const endpointHash = await sha256(endpoint.trim());
  const nowIso = new Date().toISOString();
  await db.update(browserPushSubscriptions).set({ status: "revoked", updatedAt: nowIso })
    .where(and(
      eq(browserPushSubscriptions.userEmail, user.email),
      eq(browserPushSubscriptions.endpointHash, endpointHash),
    ));
  const activeRows = await db.select({ total: count() }).from(browserPushSubscriptions).where(and(
    eq(browserPushSubscriptions.userEmail, user.email),
    eq(browserPushSubscriptions.status, "active"),
  ));
  if (Number(activeRows[0]?.total ?? 0) === 0) {
    await db.update(userNotificationPreferences).set({
      browserPushEnabled: false,
      updatedAt: nowIso,
    }).where(eq(userNotificationPreferences.userEmail, user.email));
  }
  return { endpointHash, status: "revoked" as const };
}

export async function startTelegramPairing(user: ChatGPTUser) {
  const config = await getChannelConfiguration();
  if (!config.telegram.configured || !config.telegram.botUsername) {
    throw new ModelLabValidationError("Telegram botu ve webhook sırrı henüz yapılandırılmadı.");
  }
  await ensureUserProductAccount(user);
  const db = await getDb();
  const code = randomPairingCode();
  const pairingCodeHash = await sha256(code);
  const now = new Date();
  const nowIso = now.toISOString();
  const pairingExpiresAt = new Date(now.getTime() + TELEGRAM_PAIRING_MINUTES * 60_000).toISOString();
  await db.insert(telegramConnections).values({
    userEmail: user.email,
    status: "pending",
    pairingCodeHash,
    pairingExpiresAt,
    chatId: null,
    chatUsername: null,
    verifiedAt: null,
    updatedAt: nowIso,
  }).onConflictDoUpdate({
    target: telegramConnections.userEmail,
    set: {
      status: "pending",
      pairingCodeHash,
      pairingExpiresAt,
      chatId: null,
      chatUsername: null,
      verifiedAt: null,
      lastErrorCode: null,
      updatedAt: nowIso,
    },
  });
  return {
    status: "pending" as const,
    expiresAt: pairingExpiresAt,
    deepLink: `https://t.me/${config.telegram.botUsername}?start=${code}`,
  };
}

export async function disconnectTelegram(user: ChatGPTUser) {
  await ensureUserProductAccount(user);
  const db = await getDb();
  const nowIso = new Date().toISOString();
  await db.batch([
    db.update(telegramConnections).set({
      status: "revoked",
      pairingCodeHash: null,
      pairingExpiresAt: null,
      chatId: null,
      chatUsername: null,
      updatedAt: nowIso,
    }).where(eq(telegramConnections.userEmail, user.email)),
    db.update(userNotificationPreferences).set({
      telegramEnabled: false,
      updatedAt: nowIso,
    }).where(eq(userNotificationPreferences.userEmail, user.email)),
  ]);
  return { status: "revoked" as const };
}

export async function handleTelegramWebhook(request: Request) {
  const env = await getRuntimeNotificationEnv();
  if (!telegramConfigured(env) || !env.TELEGRAM_WEBHOOK_SECRET || !env.TELEGRAM_BOT_TOKEN) {
    return Response.json({ error: "Telegram integration is not configured." }, { status: 503 });
  }
  const suppliedSecret = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!(await secureEqual(suppliedSecret, env.TELEGRAM_WEBHOOK_SECRET))) {
    return Response.json({ error: "Invalid webhook secret." }, { status: 403 });
  }
  let update: TelegramUpdate;
  try {
    update = await request.json() as TelegramUpdate;
  } catch {
    return Response.json({ ok: true });
  }
  const text = update.message?.text?.trim() ?? "";
  const match = text.match(/^\/start(?:@[A-Za-z0-9_]+)?\s+([A-F0-9]{12})$/i);
  const chatId = update.message?.chat?.id;
  if (!match || chatId === undefined || chatId === null) return Response.json({ ok: true });

  const db = await getDb();
  const pairingCodeHash = await sha256(match[1].toUpperCase());
  const nowIso = new Date().toISOString();
  const [connection] = await db.select().from(telegramConnections).where(and(
    eq(telegramConnections.pairingCodeHash, pairingCodeHash),
    eq(telegramConnections.status, "pending"),
    gt(telegramConnections.pairingExpiresAt, nowIso),
  )).limit(1);
  if (!connection) {
    await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, String(chatId), "FormEdge bağlantı kodu geçersiz veya süresi dolmuş.");
    return Response.json({ ok: true });
  }
  await db.batch([
    db.update(telegramConnections).set({
      status: "connected",
      pairingCodeHash: null,
      pairingExpiresAt: null,
      chatId: String(chatId),
      chatUsername: update.message?.chat?.username?.slice(0, 100) ?? null,
      verifiedAt: nowIso,
      lastErrorCode: null,
      updatedAt: nowIso,
    }).where(eq(telegramConnections.userEmail, connection.userEmail)),
    db.update(userNotificationPreferences).set({
      telegramEnabled: true,
      updatedAt: nowIso,
    }).where(eq(userNotificationPreferences.userEmail, connection.userEmail)),
  ]);
  await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, String(chatId), "FormEdge bildirim bağlantınız doğrulandı.");
  return Response.json({ ok: true });
}

export async function enqueuePredictionNotificationEvent(sourceEventId: string) {
  const db = await getDb();
  const [event] = await db.select().from(predictionEvents)
    .where(eq(predictionEvents.id, sourceEventId)).limit(1);
  if (!event) throw new ModelLabValidationError("Bildirim kaynak olayı bulunamadı.");
  const [thread] = await db.select().from(predictionThreads)
    .where(eq(predictionThreads.id, event.threadId)).limit(1);
  if (!thread) throw new ModelLabValidationError("Bildirim tahmin zinciri bulunamadı.");
  const [[fixture], versionRows] = await Promise.all([
    db.select().from(fixtures).where(eq(fixtures.id, thread.fixtureId)).limit(1),
    event.versionId
      ? db.select().from(predictionVersions).where(eq(predictionVersions.id, event.versionId)).limit(1)
      : Promise.resolve([]),
  ]);
  if (!fixture) throw new ModelLabValidationError("Bildirim fikstürü bulunamadı.");
  const teamRows = await db.select({ id: teams.id, name: teams.name }).from(teams)
    .where(inArray(teams.id, [fixture.homeTeamId, fixture.awayTeamId]));
  const teamById = new Map(teamRows.map((row) => [row.id, row.name]));
  const version = versionRows[0] ?? null;
  const intent = buildPredictionNotificationIntent({
    sourceEventId: event.id,
    sourceEventType: event.eventType,
    immediateNotification: event.immediateNotification,
    threadId: thread.id,
    versionId: event.versionId,
    fixtureId: fixture.id,
    leagueLabel: thread.leagueLabel,
    homeTeamName: teamById.get(fixture.homeTeamId) ?? fixture.homeTeamId,
    awayTeamName: teamById.get(fixture.awayTeamId) ?? fixture.awayTeamId,
    researchOnly: thread.researchOnly || version?.researchOnly === true,
    recommendationEligible: thread.recommendationEligible,
    reasonText: event.reasonText,
    occurredAt: event.occurredAt,
  });
  if (!intent) return null;
  const nowIso = new Date().toISOString();
  await db.insert(notificationOutbox).values({
    id: crypto.randomUUID(),
    eventKey: intent.eventKey,
    sourceEventId: event.id,
    threadId: thread.id,
    versionId: event.versionId,
    fixtureId: fixture.id,
    engineSchemaVersion: NOTIFICATION_ENGINE_SCHEMA_VERSION,
    eventType: intent.eventType,
    audienceScope: intent.audience,
    priority: intent.priority,
    title: intent.title,
    body: intent.body,
    href: intent.href,
    payloadJson: JSON.stringify(intent.payload),
    status: intent.eligible ? "pending" : "suppressed",
    suppressionCode: intent.suppressionCode,
    availableAt: nowIso,
    completedAt: intent.eligible ? null : nowIso,
    updatedAt: nowIso,
  }).onConflictDoNothing({ target: notificationOutbox.eventKey });
  const [outbox] = await db.select().from(notificationOutbox)
    .where(eq(notificationOutbox.eventKey, intent.eventKey)).limit(1);
  if (!outbox) throw new Error("Bildirim outbox kaydı oluşturulamadı.");
  if (outbox.status === "pending" || outbox.status === "failed") {
    await dispatchNotificationOutbox(outbox.id);
  }
  return outbox;
}

export async function reconcilePredictionNotificationOutbox() {
  const db = await getDb();
  const events = await db.select({ id: predictionEvents.id }).from(predictionEvents)
    .where(inArray(predictionEvents.eventType, ["finalized", "withdrawn"]))
    .orderBy(desc(predictionEvents.occurredAt)).limit(250);
  const outboxRows = events.length
    ? await db.select({ sourceEventId: notificationOutbox.sourceEventId }).from(notificationOutbox)
      .where(inArray(notificationOutbox.sourceEventId, events.map((row) => row.id)))
    : [];
  const existing = new Set(outboxRows.map((row) => row.sourceEventId));
  let created = 0;
  for (const event of events) {
    if (existing.has(event.id)) continue;
    const outbox = await enqueuePredictionNotificationEvent(event.id);
    if (outbox) created += 1;
  }
  return { scanned: events.length, created };
}

export async function processNotificationQueue(limit = 20) {
  const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)));
  const db = await getDb();
  const nowIso = new Date().toISOString();
  const rows = await db.select().from(notificationOutbox).where(and(
    or(eq(notificationOutbox.status, "pending"), eq(notificationOutbox.status, "failed")),
    lte(notificationOutbox.availableAt, nowIso),
    lte(notificationOutbox.attemptCount, MAX_QUEUE_ATTEMPTS - 1),
  )).orderBy(notificationOutbox.availableAt).limit(safeLimit);
  const results = [];
  for (const row of rows) results.push(await dispatchNotificationOutbox(row.id));
  return { processed: results.length, results };
}

export async function retryNotificationOutbox(outboxId: string) {
  if (!outboxId.trim()) throw new ModelLabValidationError("Outbox id gereklidir.");
  const db = await getDb();
  const nowIso = new Date().toISOString();
  await db.batch([
    db.update(notificationOutbox).set({
      status: "pending",
      availableAt: nowIso,
      completedAt: null,
      updatedAt: nowIso,
    }).where(eq(notificationOutbox.id, outboxId.trim())),
    db.update(notificationDeliveries).set({
      status: "pending",
      nextAttemptAt: nowIso,
      updatedAt: nowIso,
    }).where(and(
      eq(notificationDeliveries.outboxId, outboxId.trim()),
      or(
        eq(notificationDeliveries.status, "failed"),
        eq(notificationDeliveries.status, "configuration_required"),
        eq(notificationDeliveries.status, "skipped"),
      ),
    )),
  ]);
  return dispatchNotificationOutbox(outboxId.trim());
}

export async function getAdminNotificationOverview(actor: AdminActor) {
  const db = await getDb();
  const [outboxCounts, deliveryCounts, outboxRows, deliveryRows, config] = await Promise.all([
    db.select({ status: notificationOutbox.status, total: count() }).from(notificationOutbox)
      .groupBy(notificationOutbox.status),
    db.select({ channel: notificationDeliveries.channel, status: notificationDeliveries.status, total: count() })
      .from(notificationDeliveries).groupBy(notificationDeliveries.channel, notificationDeliveries.status),
    db.select().from(notificationOutbox).orderBy(desc(notificationOutbox.createdAt)).limit(40),
    db.select().from(notificationDeliveries).orderBy(desc(notificationDeliveries.updatedAt)).limit(80),
    getChannelConfiguration(),
  ]);
  const counts = { pending: 0, processing: 0, delivered: 0, partial: 0, failed: 0, suppressed: 0 };
  for (const row of outboxCounts) counts[row.status] = Number(row.total);
  return {
    actor,
    generatedAt: new Date().toISOString(),
    counts,
    channels: {
      inApp: { configured: true },
      browserPush: { configured: config.browserPush.configured, publicKeyPresent: Boolean(config.browserPush.publicKey) },
      telegram: { configured: config.telegram.configured, botUsername: config.telegram.botUsername },
    },
    deliveryMatrix: deliveryCounts.map((row) => ({ ...row, total: Number(row.total) })),
    outbox: outboxRows.map((row) => ({
      id: row.id,
      eventType: row.eventType,
      audienceScope: row.audienceScope,
      priority: row.priority,
      title: row.title,
      status: row.status,
      suppressionCode: row.suppressionCode,
      targetUserCount: row.targetUserCount,
      attemptCount: row.attemptCount,
      sourceEventId: row.sourceEventId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })),
    deliveries: deliveryRows.map((row) => ({
      id: row.id,
      outboxId: row.outboxId,
      channel: row.channel,
      status: row.status,
      attemptCount: row.attemptCount,
      lastErrorCode: row.lastErrorCode,
      sentAt: row.sentAt,
      updatedAt: row.updatedAt,
    })),
    policy: {
      schemaVersion: NOTIFICATION_ENGINE_SCHEMA_VERSION,
      researchOnlySuppressed: true,
      maxDeliveryAttempts: MAX_DELIVERY_ATTEMPTS,
      queueAttemptLimit: MAX_QUEUE_ATTEMPTS,
    },
  };
}

async function dispatchNotificationOutbox(outboxId: string) {
  const db = await getDb();
  const [outbox] = await db.select().from(notificationOutbox)
    .where(eq(notificationOutbox.id, outboxId)).limit(1);
  if (!outbox || outbox.status === "suppressed" || outbox.status === "delivered") {
    return outbox ? { id: outbox.id, status: outbox.status } : null;
  }
  const nowIso = new Date().toISOString();
  await db.update(notificationOutbox).set({
    status: "processing",
    attemptCount: sql`${notificationOutbox.attemptCount} + 1`,
    lastAttemptAt: nowIso,
    updatedAt: nowIso,
  }).where(eq(notificationOutbox.id, outbox.id));

  const recipientRows = outbox.audienceScope === "all_members"
    ? await db.select({ email: userProfiles.email }).from(userProfiles)
    : await db.select({ email: userPredictionWatchlist.userEmail }).from(userPredictionWatchlist)
      .where(eq(userPredictionWatchlist.threadId, outbox.threadId));
  const recipients = [...new Set(recipientRows.map((row) => row.email))];
  if (!recipients.length) {
    await db.update(notificationOutbox).set({
      status: "suppressed",
      suppressionCode: "NO_RECIPIENTS",
      targetUserCount: 0,
      completedAt: nowIso,
      updatedAt: nowIso,
    }).where(eq(notificationOutbox.id, outbox.id));
    return { id: outbox.id, status: "suppressed" as const, recipients: 0 };
  }

  const config = await getChannelConfiguration();
  for (const userEmail of recipients) {
    await db.insert(userNotificationPreferences).values({ userEmail }).onConflictDoNothing();
    const [[preferenceRow], pushRows, telegramRows] = await Promise.all([
      db.select().from(userNotificationPreferences)
        .where(eq(userNotificationPreferences.userEmail, userEmail)).limit(1),
      db.select().from(browserPushSubscriptions).where(and(
        eq(browserPushSubscriptions.userEmail, userEmail),
        eq(browserPushSubscriptions.status, "active"),
      )).orderBy(desc(browserPushSubscriptions.updatedAt)).limit(1),
      db.select().from(telegramConnections)
        .where(eq(telegramConnections.userEmail, userEmail)).limit(1),
    ]);
    const preferences = toNotificationPreferences(preferenceRow);
    const capabilities: ChannelCapabilities = {
      browserPushConfigured: config.browserPush.configured,
      browserPushSubscriptionActive: pushRows.length > 0,
      telegramConfigured: config.telegram.configured,
      telegramConnectionActive: telegramRows[0]?.status === "connected" && Boolean(telegramRows[0]?.chatId),
    };
    const plans = planNotificationChannels(outbox.eventType, preferences, capabilities);
    for (const plan of plans) {
      if (plan.status === "preference_disabled") continue;
      if (plan.status === "configuration_required") {
        await recordDeliveryState(outbox.id, userEmail, plan.channel, "configuration_required", "CHANNEL_NOT_CONFIGURED");
        continue;
      }
      if (plan.status === "subscription_required") {
        await recordDeliveryState(outbox.id, userEmail, plan.channel, "skipped", "CHANNEL_NOT_CONNECTED");
        continue;
      }
      if (plan.channel === "in_app") {
        await db.insert(userNotifications).values({
          id: crypto.randomUUID(),
          userEmail,
          outboxId: outbox.id,
          eventType: outbox.eventType,
          priority: outbox.priority,
          title: outbox.title,
          body: outbox.body,
          href: outbox.href,
        }).onConflictDoNothing({ target: [userNotifications.outboxId, userNotifications.userEmail] });
        await recordDeliveryState(outbox.id, userEmail, "in_app", "delivered", null, nowIso);
        continue;
      }
      const existing = await loadDelivery(outbox.id, userEmail, plan.channel);
      if (existing?.status === "delivered" || (existing?.attemptCount ?? 0) >= MAX_DELIVERY_ATTEMPTS) continue;
      await recordDeliveryState(outbox.id, userEmail, plan.channel, "pending", null);
      try {
        if (plan.channel === "browser_push" && pushRows[0]) {
          const result = await sendBrowserPush(pushRows[0], outbox, config.env);
          await recordDeliveryState(outbox.id, userEmail, plan.channel, "delivered", null, new Date().toISOString(), result.providerMessageId);
        } else if (plan.channel === "telegram" && telegramRows[0]?.chatId && config.env.TELEGRAM_BOT_TOKEN) {
          const result = await sendTelegramMessage(
            config.env.TELEGRAM_BOT_TOKEN,
            telegramRows[0].chatId,
            `${outbox.title}\n\n${outbox.body}`,
          );
          await recordDeliveryState(outbox.id, userEmail, plan.channel, "delivered", null, new Date().toISOString(), result.messageId);
        }
      } catch (error) {
        const code = deliveryErrorCode(error);
        await recordDeliveryState(outbox.id, userEmail, plan.channel, "failed", code);
        if (plan.channel === "browser_push" && pushRows[0] && isGonePushError(error)) {
          await db.update(browserPushSubscriptions).set({
            status: "revoked",
            failureCount: sql`${browserPushSubscriptions.failureCount} + 1`,
            lastErrorCode: code,
            updatedAt: new Date().toISOString(),
          }).where(eq(browserPushSubscriptions.id, pushRows[0].id));
        }
      }
    }
  }

  const deliveries = await db.select({ status: notificationDeliveries.status }).from(notificationDeliveries)
    .where(eq(notificationDeliveries.outboxId, outbox.id));
  const status = deliveries.length
    ? deriveOutboxStatus(recipients.length, deliveries)
    : "suppressed" as const;
  const completedAt = status === "pending" ? null : new Date().toISOString();
  await db.update(notificationOutbox).set({
    status,
    suppressionCode: deliveries.length ? outbox.suppressionCode : "NO_ENABLED_CHANNELS",
    targetUserCount: recipients.length,
    completedAt,
    updatedAt: new Date().toISOString(),
  }).where(eq(notificationOutbox.id, outbox.id));
  return { id: outbox.id, status, recipients: recipients.length, deliveries: deliveries.length };
}

async function recordDeliveryState(
  outboxId: string,
  userEmail: string,
  channel: NotificationChannel,
  status: typeof notificationDeliveries.$inferInsert.status,
  errorCode: string | null,
  sentAt: string | null = null,
  providerMessageId: string | null = null,
) {
  const db = await getDb();
  const nowIso = new Date().toISOString();
  const existing = await loadDelivery(outboxId, userEmail, channel);
  const attemptIncrement = status === "pending" ? 1 : 0;
  if (!existing) {
    await db.insert(notificationDeliveries).values({
      id: crypto.randomUUID(),
      outboxId,
      userEmail,
      channel,
      status,
      attemptCount: attemptIncrement,
      providerMessageId,
      lastErrorCode: errorCode,
      nextAttemptAt: status === "failed" ? nextRetryIso(1) : null,
      sentAt,
      updatedAt: nowIso,
    });
    return;
  }
  const attemptCount = existing.attemptCount + attemptIncrement;
  await db.update(notificationDeliveries).set({
    status,
    attemptCount,
    providerMessageId,
    lastErrorCode: errorCode,
    nextAttemptAt: status === "failed" && attemptCount < MAX_DELIVERY_ATTEMPTS
      ? nextRetryIso(attemptCount)
      : null,
    sentAt: sentAt ?? existing.sentAt,
    updatedAt: nowIso,
  }).where(eq(notificationDeliveries.id, existing.id));
}

async function loadDelivery(outboxId: string, userEmail: string, channel: NotificationChannel) {
  const db = await getDb();
  const [row] = await db.select().from(notificationDeliveries).where(and(
    eq(notificationDeliveries.outboxId, outboxId),
    eq(notificationDeliveries.userEmail, userEmail),
    eq(notificationDeliveries.channel, channel),
  )).limit(1);
  return row ?? null;
}

async function getChannelConfiguration() {
  const env = await getRuntimeNotificationEnv();
  return {
    env,
    browserPush: {
      configured: browserPushConfigured(env),
      publicKey: browserPushConfigured(env) ? env.VAPID_PUBLIC_KEY! : null,
    },
    telegram: {
      configured: telegramConfigured(env),
      botUsername: telegramConfigured(env) ? normalizeBotUsername(env.TELEGRAM_BOT_USERNAME!) : null,
    },
  };
}

async function getRuntimeNotificationEnv(): Promise<RuntimeNotificationEnv> {
  const { env } = await import("cloudflare:workers");
  return env as unknown as RuntimeNotificationEnv;
}

function browserPushConfigured(env: RuntimeNotificationEnv) {
  return Boolean(
    nonEmpty(env.VAPID_PUBLIC_KEY)
    && nonEmpty(env.VAPID_PRIVATE_KEY)
    && nonEmpty(env.VAPID_SUBJECT),
  );
}

function telegramConfigured(env: RuntimeNotificationEnv) {
  return Boolean(
    nonEmpty(env.TELEGRAM_BOT_TOKEN)
    && nonEmpty(env.TELEGRAM_BOT_USERNAME)
    && nonEmpty(env.TELEGRAM_WEBHOOK_SECRET),
  );
}

function nonEmpty(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeBotUsername(value: string) {
  return value.trim().replace(/^@/, "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 64);
}

function toNotificationPreferences(
  row: typeof userNotificationPreferences.$inferSelect | undefined,
): NotificationPreferences {
  return {
    finalAnalysisEnabled: row?.finalAnalysisEnabled ?? true,
    valueOpportunityEnabled: row?.valueOpportunityEnabled ?? true,
    predictionWithdrawnEnabled: row?.predictionWithdrawnEnabled ?? true,
    inAppEnabled: row?.inAppEnabled ?? true,
    browserPushEnabled: row?.browserPushEnabled ?? false,
    telegramEnabled: row?.telegramEnabled ?? false,
  };
}

function validatePushSubscription(input: PushSubscriptionInput) {
  if (!input || typeof input !== "object") throw new ModelLabValidationError("Push aboneliği gereklidir.");
  let endpoint: URL;
  try {
    endpoint = new URL(input.endpoint);
  } catch {
    throw new ModelLabValidationError("Push endpoint geçerli bir URL olmalıdır.");
  }
  if (endpoint.protocol !== "https:" || input.endpoint.length > 2_000) {
    throw new ModelLabValidationError("Push endpoint güvenli ve 2.000 karakterden kısa olmalıdır.");
  }
  if (!input.keys || typeof input.keys.p256dh !== "string" || typeof input.keys.auth !== "string") {
    throw new ModelLabValidationError("Push şifreleme anahtarları eksik.");
  }
  if (input.keys.p256dh.length < 40 || input.keys.p256dh.length > 300 || input.keys.auth.length < 8 || input.keys.auth.length > 200) {
    throw new ModelLabValidationError("Push şifreleme anahtarları geçersiz.");
  }
}

async function sendBrowserPush(
  subscription: typeof browserPushSubscriptions.$inferSelect,
  outbox: typeof notificationOutbox.$inferSelect,
  env: RuntimeNotificationEnv,
) {
  if (!browserPushConfigured(env)) throw new Error("PUSH_NOT_CONFIGURED");
  const imported = await import("web-push");
  const webPush = imported.default;
  webPush.setVapidDetails(env.VAPID_SUBJECT!, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
  const response = await webPush.sendNotification({
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.p256dh, auth: subscription.auth },
  }, JSON.stringify({
    title: outbox.title,
    body: outbox.body,
    href: outbox.href,
    eventType: outbox.eventType,
    priority: outbox.priority,
  }), {
    TTL: outbox.priority === "critical" ? 21_600 : 3_600,
    urgency: outbox.priority === "critical" ? "high" : "normal",
  });
  return { providerMessageId: response.headers.location ?? null };
}

async function sendTelegramMessage(token: string, chatId: string, text: string) {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: text.slice(0, 3_800),
      disable_web_page_preview: true,
    }),
  });
  const payload = await response.json() as {
    ok?: boolean;
    result?: { message_id?: number };
    description?: string;
  };
  if (!response.ok || !payload.ok) throw new Error(`TELEGRAM_${response.status}`);
  return { messageId: payload.result?.message_id ? String(payload.result.message_id) : null };
}

function randomPairingCode() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function secureEqual(first: string, second: string) {
  const [firstHash, secondHash] = await Promise.all([sha256(first), sha256(second)]);
  let result = 0;
  for (let index = 0; index < firstHash.length; index += 1) {
    result |= firstHash.charCodeAt(index) ^ secondHash.charCodeAt(index);
  }
  return result === 0;
}

function nextRetryIso(attemptCount: number) {
  const delayMinutes = Math.min(30, 2 ** Math.max(0, attemptCount - 1));
  return new Date(Date.now() + delayMinutes * 60_000).toISOString();
}

function deliveryErrorCode(error: unknown) {
  if (error && typeof error === "object" && "statusCode" in error) {
    const statusCode = Number((error as { statusCode?: unknown }).statusCode);
    if (Number.isFinite(statusCode)) return `HTTP_${statusCode}`;
  }
  if (error instanceof Error && /^[A-Z0-9_]{3,80}$/.test(error.message)) return error.message;
  return "DELIVERY_FAILED";
}

function isGonePushError(error: unknown) {
  if (!error || typeof error !== "object" || !("statusCode" in error)) return false;
  const statusCode = Number((error as { statusCode?: unknown }).statusCode);
  return statusCode === 404 || statusCode === 410;
}

type TelegramUpdate = {
  message?: {
    text?: string;
    chat?: { id?: string | number; username?: string };
  };
};

export type UserNotificationCenter = Awaited<ReturnType<typeof getUserNotificationCenter>>;
export type AdminNotificationOverview = Awaited<ReturnType<typeof getAdminNotificationOverview>>;
