import {
  and,
  count,
  desc,
  eq,
  inArray,
  lte,
  or,
  sql,
} from "drizzle-orm";
import type { ChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import {
  appMembers,
  betaInvitations,
  betaOperationRuns,
  betaProgramSettings,
  betaWaitlistEntries,
  membershipEvents,
  publicRateLimitBuckets,
  userProfiles,
} from "@/db/schema";
import type { AdminActor } from "@/lib/admin-data";
import {
  BETA_ACCESS_POLICY_VERSION,
  BETA_DEFAULT_CAPACITY,
  BETA_INVITATION_TTL_HOURS,
  evaluateBetaReadiness,
  evaluateInvitationAcceptance,
  fixedWindowStart,
  invitationWindow,
  normalizeBetaProgramUpdate,
  validateInvitationToken,
} from "@/lib/beta-access-engine";
import { MEMBERSHIP_POLICY_VERSION } from "@/lib/membership-engine";
import { ModelLabValidationError } from "@/lib/model-lab";
import { ensureUserProductAccount } from "@/lib/user-account-store";

const PROGRAM_ID = "default";
const INVITATION_MAX_ATTEMPTS = 3;
const WAITLIST_GLOBAL_LIMIT = { hits: 60, windowSeconds: 600 } as const;
const WAITLIST_EMAIL_LIMIT = { hits: 5, windowSeconds: 3_600 } as const;
const WAITLIST_NETWORK_LIMIT = { hits: 12, windowSeconds: 600 } as const;

type RuntimeBetaEnv = {
  PUBLIC_SITE_ACCESS_CONFIRMED?: string;
  PUBLIC_BETA_ENABLED?: string;
  PUBLIC_IDENTITY_PROVIDER?: string;
  PUBLIC_APP_ORIGIN?: string;
  INVITE_EMAIL_ENDPOINT?: string;
  INVITE_EMAIL_TOKEN?: string;
  INVITE_EMAIL_FROM?: string;
  INVITE_TOKEN_SECRET?: string;
  WAITLIST_RATE_LIMIT_SECRET?: string;
  MEMBERSHIP_SCHEDULER_SECRET?: string;
};

export class BetaAccessHttpError extends Error {
  constructor(
    public status: 403 | 404 | 409 | 429 | 503,
    public code: string,
    message: string,
    public retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "BetaAccessHttpError";
  }
}

export async function enforceWaitlistRateLimit(input: {
  email: string;
  networkAddress?: string | null;
}) {
  const normalizedEmail = input.email.trim().toLowerCase();
  const runtime = await getBetaRuntime();
  const checks = [
    await consumeRateLimit("global", "formedge-waitlist", WAITLIST_GLOBAL_LIMIT),
    await consumeRateLimit("email", normalizedEmail, WAITLIST_EMAIL_LIMIT),
  ];
  const networkAddress = normalizeNetworkAddress(input.networkAddress);
  if (networkAddress && runtime.env.WAITLIST_RATE_LIMIT_SECRET) {
    checks.push(await consumeRateLimit(
      "network",
      `${runtime.env.WAITLIST_RATE_LIMIT_SECRET}:${networkAddress}`,
      WAITLIST_NETWORK_LIMIT,
    ));
  }
  const exceeded = checks.find((check) => !check.allowed);
  if (exceeded) {
    throw new BetaAccessHttpError(
      429,
      "WAITLIST_RATE_LIMITED",
      "Çok fazla bekleme listesi isteği gönderildi. Lütfen daha sonra tekrar deneyin.",
      exceeded.retryAfterSeconds,
    );
  }
  return { allowed: true as const, checks: checks.map(({ scope, remaining }) => ({ scope, remaining })) };
}

export async function getBetaProgramOverview(actor: AdminActor) {
  const db = await getDb();
  const settings = await ensureProgramSettings();
  const runtime = await getBetaRuntime();
  const [invitationCounts, invitations, recentRuns, activeProfiles, internalRows] = await Promise.all([
    db.select({ status: betaInvitations.status, total: count() }).from(betaInvitations)
      .groupBy(betaInvitations.status),
    db.select().from(betaInvitations).orderBy(desc(betaInvitations.createdAt)).limit(80),
    db.select().from(betaOperationRuns).orderBy(desc(betaOperationRuns.startedAt)).limit(12),
    db.select({ email: userProfiles.email }).from(userProfiles)
      .where(eq(userProfiles.betaAccessStatus, "active")),
    db.select({ email: appMembers.email }).from(appMembers).where(eq(appMembers.status, "active")),
  ]);
  const internalEmails = new Set(internalRows.map((row) => row.email.toLowerCase()));
  const activeMemberCount = activeProfiles.filter((row) => !internalEmails.has(row.email.toLowerCase())).length;
  const reservedInvitationCount = invitations.filter((row) => row.status === "queued" || row.status === "sent").length;
  return {
    actor,
    policyVersion: BETA_ACCESS_POLICY_VERSION,
    settings: {
      capacityLimit: settings.capacityLimit,
      invitationsEnabled: settings.invitationsEnabled,
      invitationTtlHours: settings.invitationTtlHours,
      updatedAt: settings.updatedAt,
      updatedByEmail: settings.updatedByEmail,
    },
    readiness: runtime.readiness,
    capacity: {
      activeMembers: activeMemberCount,
      reservedInvitations: reservedInvitationCount,
      occupied: activeMemberCount + reservedInvitationCount,
      available: Math.max(0, settings.capacityLimit - activeMemberCount - reservedInvitationCount),
    },
    invitationCounts: groupedCounts(invitationCounts),
    invitations: invitations.map((row) => publicAdminInvitation(row, actor.role === "editor")),
    recentRuns: recentRuns.map((row) => ({
      id: row.id,
      trigger: row.trigger,
      status: row.status,
      actorEmail: actor.role === "editor" && row.actorEmail ? maskEmail(row.actorEmail) : row.actorEmail,
      result: parseJson<Record<string, unknown>>(row.resultJson, {}),
      errorCode: row.errorCode,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
    })),
    delivery: {
      relayConfigured: runtime.readiness.checks.emailRelay,
      schedulerConfigured: runtime.readiness.checks.scheduler,
      maxAttempts: INVITATION_MAX_ATTEMPTS,
    },
  };
}

export async function updateBetaProgram(
  actor: AdminActor,
  input: { capacityLimit?: unknown; invitationsEnabled?: unknown },
) {
  requireMembershipAdmin(actor);
  const normalized = normalizeBetaProgramUpdate(input);
  const current = await getBetaProgramOverview(actor);
  if (normalized.capacityLimit < current.capacity.occupied) {
    throw new BetaAccessHttpError(
      409,
      "CAPACITY_BELOW_OCCUPANCY",
      `Kapasite mevcut ${current.capacity.occupied} aktif/rezerve koltuğun altına indirilemez.`,
    );
  }
  if (normalized.invitationsEnabled && !current.readiness.ready) {
    throw new BetaAccessHttpError(
      503,
      "BETA_READINESS_BLOCKED",
      `Davetler açılamadı: ${current.readiness.blockers.join(", ")}.`,
    );
  }
  const db = await getDb();
  await db.update(betaProgramSettings).set({
    capacityLimit: normalized.capacityLimit,
    invitationsEnabled: normalized.invitationsEnabled,
    updatedByEmail: actor.email,
    updatedAt: new Date().toISOString(),
  }).where(eq(betaProgramSettings.id, PROGRAM_ID));
  return getBetaProgramOverview(actor);
}

export async function createBetaInvitation(actor: AdminActor, waitlistEntryId: string) {
  requireMembershipAdmin(actor);
  if (!waitlistEntryId.trim()) throw new ModelLabValidationError("Bekleme listesi kaydı gereklidir.");
  const db = await getDb();
  const [waitlist] = await db.select().from(betaWaitlistEntries)
    .where(eq(betaWaitlistEntries.id, waitlistEntryId.trim())).limit(1);
  if (!waitlist) throw new BetaAccessHttpError(404, "WAITLIST_ENTRY_NOT_FOUND", "Bekleme listesi kaydı bulunamadı.");
  if (waitlist.status === "blocked" || waitlist.status === "withdrawn" || waitlist.status === "accepted") {
    throw new BetaAccessHttpError(409, "WAITLIST_ENTRY_INACTIVE", "Bu bekleme listesi kaydı davete uygun değil.");
  }
  const program = await getBetaProgramOverview(actor);
  if (!program.settings.invitationsEnabled || !program.readiness.ready) {
    throw new BetaAccessHttpError(503, "INVITATIONS_CLOSED", "Beta davet kapısı henüz açılmadı.");
  }
  const [existing] = await db.select().from(betaInvitations).where(and(
    eq(betaInvitations.email, waitlist.email),
    inArray(betaInvitations.status, ["queued", "sent"]),
  )).orderBy(desc(betaInvitations.createdAt)).limit(1);
  if (existing) return publicAdminInvitation(existing);

  const runtime = await getBetaRuntime();
  if (!runtime.env.INVITE_TOKEN_SECRET) {
    throw new BetaAccessHttpError(503, "TOKEN_ENCRYPTION_UNAVAILABLE", "Davet token şifreleme anahtarı eksik.");
  }
  const token = randomToken();
  const tokenHash = await sha256(token);
  const encrypted = await encryptToken(token, runtime.env.INVITE_TOKEN_SECRET);
  const nowIso = new Date().toISOString();
  const window = invitationWindow(nowIso);
  const invitationId = crypto.randomUUID();
  const idempotencyKey = `${BETA_ACCESS_POLICY_VERSION}:invite:${waitlist.id}:${invitationId}`;
  await db.run(sql`
    INSERT INTO beta_invitations (
      id, waitlist_entry_id, email, display_name, locale, token_hash,
      token_ciphertext, token_iv, status, delivery_status, attempt_count,
      available_at, expires_at, created_by_email, idempotency_key, created_at, updated_at
    )
    SELECT
      ${invitationId}, ${waitlist.id}, ${waitlist.email}, ${waitlist.displayName}, ${waitlist.locale}, ${tokenHash},
      ${encrypted.ciphertext}, ${encrypted.iv}, 'queued', 'pending', 0,
      ${nowIso}, ${window.expiresAt}, ${actor.email}, ${idempotencyKey}, ${nowIso}, ${nowIso}
    WHERE (
      (SELECT COUNT(*) FROM beta_invitations WHERE status IN ('queued', 'sent'))
      +
      (SELECT COUNT(*) FROM user_profiles profile
        WHERE profile.beta_access_status = 'active'
          AND NOT EXISTS (
            SELECT 1 FROM app_members member
            WHERE member.email = profile.email AND member.status = 'active'
          ))
    ) < (SELECT capacity_limit FROM beta_program_settings WHERE id = ${PROGRAM_ID})
    AND (SELECT invitations_enabled FROM beta_program_settings WHERE id = ${PROGRAM_ID}) = 1
    AND NOT EXISTS (
      SELECT 1 FROM beta_invitations
      WHERE email = ${waitlist.email} AND status IN ('queued', 'sent')
    )
  `);
  const [created] = await db.select().from(betaInvitations).where(eq(betaInvitations.id, invitationId)).limit(1);
  if (!created) {
    throw new BetaAccessHttpError(409, "BETA_CAPACITY_REACHED", "Beta kapasitesi dolu veya bu kullanıcı için etkin davet zaten var.");
  }
  await db.update(betaWaitlistEntries).set({
    status: "invited",
    invitedAt: nowIso,
    updatedAt: nowIso,
  }).where(eq(betaWaitlistEntries.id, waitlist.id));
  await processBetaInvitationQueue(1, invitationId);
  const [finalRow] = await db.select().from(betaInvitations).where(eq(betaInvitations.id, invitationId)).limit(1);
  return publicAdminInvitation(finalRow ?? created);
}

export async function revokeBetaInvitation(actor: AdminActor, invitationId: string) {
  requireMembershipAdmin(actor);
  if (!invitationId.trim()) throw new ModelLabValidationError("Davet kaydı gereklidir.");
  const db = await getDb();
  const nowIso = new Date().toISOString();
  await db.update(betaInvitations).set({
    status: "revoked",
    revokedAt: nowIso,
    updatedAt: nowIso,
  }).where(and(
    eq(betaInvitations.id, invitationId.trim()),
    inArray(betaInvitations.status, ["queued", "sent", "failed"]),
  ));
  const [row] = await db.select().from(betaInvitations)
    .where(eq(betaInvitations.id, invitationId.trim())).limit(1);
  if (!row) throw new BetaAccessHttpError(404, "INVITATION_NOT_FOUND", "Davet kaydı bulunamadı.");
  return publicAdminInvitation(row);
}

export async function retryBetaInvitation(actor: AdminActor, invitationId: string) {
  requireMembershipAdmin(actor);
  const db = await getDb();
  const nowIso = new Date().toISOString();
  await db.update(betaInvitations).set({
    status: "queued",
    deliveryStatus: "pending",
    availableAt: nowIso,
    lastErrorCode: null,
    updatedAt: nowIso,
  }).where(and(
    eq(betaInvitations.id, invitationId.trim()),
    eq(betaInvitations.status, "failed"),
    lte(betaInvitations.attemptCount, INVITATION_MAX_ATTEMPTS - 1),
  ));
  await processBetaInvitationQueue(1, invitationId.trim());
  const [row] = await db.select().from(betaInvitations)
    .where(eq(betaInvitations.id, invitationId.trim())).limit(1);
  if (!row) throw new BetaAccessHttpError(404, "INVITATION_NOT_FOUND", "Davet kaydı bulunamadı.");
  return publicAdminInvitation(row);
}

export async function processBetaInvitationQueue(limit = 10, onlyInvitationId?: string) {
  const safeLimit = Math.max(1, Math.min(25, Math.floor(limit)));
  const db = await getDb();
  const runtime = await getBetaRuntime();
  const nowIso = new Date().toISOString();
  const where = and(
    onlyInvitationId ? eq(betaInvitations.id, onlyInvitationId) : undefined,
    or(eq(betaInvitations.status, "queued"), eq(betaInvitations.status, "failed")),
    lte(betaInvitations.availableAt, nowIso),
    lte(betaInvitations.attemptCount, INVITATION_MAX_ATTEMPTS - 1),
  );
  const rows = await db.select().from(betaInvitations)
    .where(where).orderBy(betaInvitations.availableAt).limit(safeLimit);
  const results = [];
  for (const row of rows) results.push(await deliverInvitation(row, runtime));
  return { processed: results.length, results };
}

export async function getPublicInvitation(tokenValue: string, userEmail?: string | null) {
  const token = validateInvitationToken(tokenValue);
  const db = await getDb();
  const tokenHash = await sha256(token);
  const [row] = await db.select().from(betaInvitations)
    .where(eq(betaInvitations.tokenHash, tokenHash)).limit(1);
  if (!row) return null;
  const expired = Date.parse(row.expiresAt) <= Date.now() || row.status === "expired";
  return {
    status: expired ? "expired" as const : row.status,
    maskedEmail: maskEmail(row.email),
    locale: row.locale,
    expiresAt: row.expiresAt,
    acceptedAt: row.acceptedAt,
    emailMatches: userEmail
      ? row.email.trim().toLowerCase() === userEmail.trim().toLowerCase()
      : null,
  };
}

export async function acceptBetaInvitation(user: ChatGPTUser, tokenValue: string) {
  const token = validateInvitationToken(tokenValue);
  const runtime = await getBetaRuntime();
  if (!runtime.readiness.checks.publicSiteAccess
    || !runtime.readiness.checks.publicBeta
    || !runtime.readiness.checks.identityProvider) {
    throw new BetaAccessHttpError(503, "PUBLIC_BETA_NOT_ACTIVE", "Public beta erişim kapısı henüz aktif değil.");
  }
  const tokenHash = await sha256(token);
  const db = await getDb();
  const [invitation] = await db.select().from(betaInvitations)
    .where(eq(betaInvitations.tokenHash, tokenHash)).limit(1);
  if (!invitation) throw new BetaAccessHttpError(404, "INVITATION_NOT_FOUND", "Davet bulunamadı.");
  const acceptance = evaluateInvitationAcceptance({
    status: invitation.status,
    expiresAt: invitation.expiresAt,
    invitationEmail: invitation.email,
    userEmail: user.email,
  });
  if (!acceptance.emailMatches) {
    throw new BetaAccessHttpError(403, "INVITATION_EMAIL_MISMATCH", "Giriş yapılan hesap davet e-postasıyla eşleşmiyor.");
  }
  if (acceptance.alreadyAccepted) {
    return {
      status: "accepted" as const,
      onboardingRequired: true,
      acceptedAt: invitation.acceptedAt ?? invitation.updatedAt,
    };
  }
  if (acceptance.expired) {
    await db.update(betaInvitations).set({ status: "expired", updatedAt: new Date().toISOString() })
      .where(eq(betaInvitations.id, invitation.id));
    throw new BetaAccessHttpError(409, "INVITATION_EXPIRED", "Davet bağlantısının süresi dolmuş.");
  }
  if (!acceptance.eligible) {
    throw new BetaAccessHttpError(409, "INVITATION_INACTIVE", "Davet artık etkin değil.");
  }
  await ensureUserProductAccount(user);
  const nowIso = new Date().toISOString();
  await db.batch([
    db.update(betaInvitations).set({
      status: "accepted",
      acceptedAt: nowIso,
      updatedAt: nowIso,
    }).where(eq(betaInvitations.id, invitation.id)),
    db.update(betaWaitlistEntries).set({
      status: "accepted",
      acceptedAt: nowIso,
      updatedAt: nowIso,
    }).where(eq(betaWaitlistEntries.id, invitation.waitlistEntryId)),
    db.update(userProfiles).set({
      betaAccessStatus: "active",
      updatedAt: nowIso,
    }).where(eq(userProfiles.email, user.email)),
    db.insert(membershipEvents).values({
      id: crypto.randomUUID(),
      userEmail: user.email,
      eventType: "invitation_accepted",
      fromPlan: "free",
      toPlan: "free",
      fromSubscriptionStatus: "beta",
      toSubscriptionStatus: "beta",
      actorEmail: user.email,
      reasonCode: "CONTROLLED_BETA_INVITATION_ACCEPTED",
      idempotencyKey: `${MEMBERSHIP_POLICY_VERSION}:invitation-accepted:${invitation.id}`,
      metadataJson: JSON.stringify({ invitationId: invitation.id, policyVersion: BETA_ACCESS_POLICY_VERSION }),
      occurredAt: nowIso,
    }).onConflictDoNothing({ target: membershipEvents.idempotencyKey }),
  ]);
  return { status: "accepted" as const, onboardingRequired: true, acceptedAt: nowIso };
}

export async function runBetaMaintenance(
  trigger: "admin" | "scheduler",
  actorEmail: string | null,
) {
  const db = await getDb();
  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  await db.insert(betaOperationRuns).values({
    id: runId,
    trigger,
    status: "processing",
    actorEmail,
    startedAt,
  });
  try {
    const nowIso = new Date().toISOString();
    const expiredInvitations = await expireInvitations(nowIso);
    const prunedRateLimits = await pruneRateLimits(nowIso);
    const expiredTrials = await expireTrials(nowIso);
    const invitationQueue = await processBetaInvitationQueue(20);
    const result = { expiredInvitations, prunedRateLimits, expiredTrials, invitationQueue };
    await db.update(betaOperationRuns).set({
      status: "completed",
      resultJson: JSON.stringify(result),
      completedAt: new Date().toISOString(),
    }).where(eq(betaOperationRuns.id, runId));
    return { runId, ...result };
  } catch (error) {
    await db.update(betaOperationRuns).set({
      status: "failed",
      errorCode: error instanceof Error ? error.name : "UNKNOWN_ERROR",
      completedAt: new Date().toISOString(),
    }).where(eq(betaOperationRuns.id, runId));
    throw error;
  }
}

export async function authorizeMembershipScheduler(request: Request) {
  const runtime = await getBetaRuntime();
  const expected = runtime.env.MEMBERSHIP_SCHEDULER_SECRET;
  if (!expected || expected.length < 32) {
    throw new BetaAccessHttpError(503, "SCHEDULER_UNCONFIGURED", "Membership scheduler sırrı yapılandırılmadı.");
  }
  const supplied = request.headers.get("x-formedge-scheduler-secret") ?? "";
  if (!(await secureEqual(supplied, expected))) {
    throw new BetaAccessHttpError(403, "SCHEDULER_UNAUTHORIZED", "Scheduler doğrulaması başarısız.");
  }
}

async function ensureProgramSettings() {
  const db = await getDb();
  await db.insert(betaProgramSettings).values({
    id: PROGRAM_ID,
    capacityLimit: BETA_DEFAULT_CAPACITY,
    invitationsEnabled: false,
    invitationTtlHours: BETA_INVITATION_TTL_HOURS,
  }).onConflictDoNothing();
  const [settings] = await db.select().from(betaProgramSettings)
    .where(eq(betaProgramSettings.id, PROGRAM_ID)).limit(1);
  if (!settings) throw new Error("Beta program settings could not be initialized.");
  return settings;
}

async function consumeRateLimit(
  scope: "global" | "email" | "network",
  subject: string,
  policy: { hits: number; windowSeconds: number },
) {
  const db = await getDb();
  const now = new Date();
  const nowIso = now.toISOString();
  const windowStartedAt = fixedWindowStart(nowIso, policy.windowSeconds);
  const expiresAt = new Date(Date.parse(windowStartedAt) + policy.windowSeconds * 2_000).toISOString();
  const id = await sha256(`${BETA_ACCESS_POLICY_VERSION}:${scope}:${subject}:${windowStartedAt}`);
  await db.insert(publicRateLimitBuckets).values({
    id,
    scope,
    windowStartedAt,
    hitCount: 1,
    expiresAt,
    updatedAt: nowIso,
  }).onConflictDoUpdate({
    target: publicRateLimitBuckets.id,
    set: {
      hitCount: sql`${publicRateLimitBuckets.hitCount} + 1`,
      updatedAt: nowIso,
    },
  });
  const [bucket] = await db.select().from(publicRateLimitBuckets)
    .where(eq(publicRateLimitBuckets.id, id)).limit(1);
  const used = bucket?.hitCount ?? policy.hits + 1;
  const windowEndsMs = Date.parse(windowStartedAt) + policy.windowSeconds * 1_000;
  return {
    scope,
    allowed: used <= policy.hits,
    remaining: Math.max(0, policy.hits - used),
    retryAfterSeconds: Math.max(1, Math.ceil((windowEndsMs - now.getTime()) / 1_000)),
  };
}

async function deliverInvitation(
  row: typeof betaInvitations.$inferSelect,
  runtime: Awaited<ReturnType<typeof getBetaRuntime>>,
) {
  const db = await getDb();
  const nowIso = new Date().toISOString();
  const attemptCount = row.attemptCount + 1;
  if (!runtime.readiness.checks.emailRelay
    || !runtime.readiness.checks.appOrigin
    || !runtime.readiness.checks.tokenEncryption
    || !runtime.emailEndpoint
    || !runtime.appOrigin
    || !runtime.env.INVITE_TOKEN_SECRET
    || !runtime.env.INVITE_EMAIL_TOKEN
    || !runtime.env.INVITE_EMAIL_FROM) {
    await db.update(betaInvitations).set({
      status: "failed",
      deliveryStatus: "configuration_required",
      attemptCount,
      lastAttemptAt: nowIso,
      lastErrorCode: "EMAIL_RELAY_CONFIGURATION_REQUIRED",
      updatedAt: nowIso,
    }).where(eq(betaInvitations.id, row.id));
    return { id: row.id, status: "configuration_required" as const };
  }
  try {
    const token = await decryptToken(row.tokenCiphertext, row.tokenIv, runtime.env.INVITE_TOKEN_SECRET);
    const inviteUrl = new URL(`/invite/${encodeURIComponent(token)}`, runtime.appOrigin).toString();
    const response = await fetch(runtime.emailEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${runtime.env.INVITE_EMAIL_TOKEN}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        event: "formedge.beta_invitation",
        policyVersion: BETA_ACCESS_POLICY_VERSION,
        from: runtime.env.INVITE_EMAIL_FROM,
        recipient: { email: row.email, displayName: row.displayName, locale: row.locale },
        invitation: { url: inviteUrl, expiresAt: row.expiresAt, hoursValid: BETA_INVITATION_TTL_HOURS },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`EMAIL_RELAY_HTTP_${response.status}`);
    await db.update(betaInvitations).set({
      status: "sent",
      deliveryStatus: "sent",
      attemptCount,
      lastAttemptAt: nowIso,
      lastErrorCode: null,
      sentAt: nowIso,
      updatedAt: nowIso,
    }).where(eq(betaInvitations.id, row.id));
    return { id: row.id, status: "sent" as const };
  } catch (error) {
    const exhausted = attemptCount >= INVITATION_MAX_ATTEMPTS;
    const errorCode = safeErrorCode(error);
    await db.update(betaInvitations).set({
      status: exhausted ? "failed" : "queued",
      deliveryStatus: "failed",
      attemptCount,
      availableAt: new Date(Date.now() + Math.min(30, 2 ** attemptCount) * 60_000).toISOString(),
      lastAttemptAt: nowIso,
      lastErrorCode: errorCode,
      updatedAt: nowIso,
    }).where(eq(betaInvitations.id, row.id));
    return { id: row.id, status: exhausted ? "failed" as const : "retry_scheduled" as const, errorCode };
  }
}

async function expireInvitations(nowIso: string) {
  const db = await getDb();
  const result = await db.update(betaInvitations).set({
    status: "expired",
    updatedAt: nowIso,
  }).where(and(
    inArray(betaInvitations.status, ["queued", "sent", "failed"]),
    lte(betaInvitations.expiresAt, nowIso),
  ));
  return changedRows(result);
}

async function pruneRateLimits(nowIso: string) {
  const db = await getDb();
  const result = await db.delete(publicRateLimitBuckets)
    .where(lte(publicRateLimitBuckets.expiresAt, nowIso));
  return changedRows(result);
}

async function expireTrials(nowIso: string) {
  const db = await getDb();
  const profiles = await db.select().from(userProfiles).where(and(
    eq(userProfiles.subscriptionStatus, "trial"),
    lte(userProfiles.trialEndsAt, nowIso),
  ));
  for (const profile of profiles) {
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
        reasonCode: "SCHEDULED_TRIAL_WINDOW_ENDED",
        idempotencyKey: `${MEMBERSHIP_POLICY_VERSION}:trial-expired:${profile.email}:${profile.trialEndsAt}`,
        metadataJson: JSON.stringify({ endedAt: profile.trialEndsAt }),
        occurredAt: nowIso,
      }).onConflictDoNothing({ target: membershipEvents.idempotencyKey }),
    ]);
  }
  return profiles.length;
}

async function getBetaRuntime() {
  const { env } = await import("cloudflare:workers");
  const runtimeEnv = env as unknown as RuntimeBetaEnv;
  const emailEndpoint = safeHttpsUrl(runtimeEnv.INVITE_EMAIL_ENDPOINT);
  const appOrigin = safeHttpsOrigin(runtimeEnv.PUBLIC_APP_ORIGIN);
  const signals = {
    publicSiteAccessConfirmed: runtimeEnv.PUBLIC_SITE_ACCESS_CONFIRMED === "true",
    publicBetaEnabled: runtimeEnv.PUBLIC_BETA_ENABLED === "true",
    identityProvider: runtimeEnv.PUBLIC_IDENTITY_PROVIDER === "chatgpt_siwc" ? "chatgpt_siwc" as const : null,
    emailRelayConfigured: Boolean(
      emailEndpoint && nonEmpty(runtimeEnv.INVITE_EMAIL_TOKEN) && nonEmpty(runtimeEnv.INVITE_EMAIL_FROM),
    ),
    schedulerConfigured: Boolean(runtimeEnv.MEMBERSHIP_SCHEDULER_SECRET && runtimeEnv.MEMBERSHIP_SCHEDULER_SECRET.length >= 32),
    tokenEncryptionConfigured: Boolean(runtimeEnv.INVITE_TOKEN_SECRET && runtimeEnv.INVITE_TOKEN_SECRET.length >= 32),
    networkRateLimitConfigured: Boolean(runtimeEnv.WAITLIST_RATE_LIMIT_SECRET && runtimeEnv.WAITLIST_RATE_LIMIT_SECRET.length >= 32),
    appOriginConfigured: Boolean(appOrigin),
  };
  return { env: runtimeEnv, emailEndpoint, appOrigin, readiness: evaluateBetaReadiness(signals) };
}

function requireMembershipAdmin(actor: AdminActor) {
  if (actor.role !== "admin") {
    throw new BetaAccessHttpError(403, "MEMBERSHIP_ADMIN_REQUIRED", "Davet ve kapasite işlemleri yalnız yönetici rolüne açıktır.");
  }
}

function publicAdminInvitation(row: typeof betaInvitations.$inferSelect, redactPii = false) {
  return {
    id: row.id,
    waitlistEntryId: row.waitlistEntryId,
    email: redactPii ? maskEmail(row.email) : row.email,
    displayName: redactPii ? null : row.displayName,
    locale: row.locale,
    status: row.status,
    deliveryStatus: row.deliveryStatus,
    attemptCount: row.attemptCount,
    expiresAt: row.expiresAt,
    sentAt: row.sentAt,
    acceptedAt: row.acceptedAt,
    lastErrorCode: row.lastErrorCode,
    createdAt: row.createdAt,
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

function normalizeNetworkAddress(value?: string | null) {
  const normalized = value?.trim() ?? "";
  return normalized && normalized.length <= 64 ? normalized : null;
}

function safeHttpsUrl(value?: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

function safeHttpsOrigin(value?: string) {
  const url = safeHttpsUrl(value);
  if (!url) return null;
  const parsed = new URL(url);
  return `${parsed.origin}/`;
}

function nonEmpty(value?: string) {
  return typeof value === "string" && value.trim().length > 0;
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bytesToBase64Url(bytes);
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

async function encryptToken(token: string, secret: string) {
  const key = await aesKey(secret, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(token));
  return { ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)), iv: bytesToBase64Url(iv) };
}

async function decryptToken(ciphertext: string, iv: string, secret: string) {
  const key = await aesKey(secret, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlToBytes(iv) },
    key,
    base64UrlToBytes(ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}

async function aesKey(secret: string, usages: KeyUsage[]) {
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, usages);
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function secureEqual(left: string, right: string) {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  if (leftBytes.length !== rightBytes.length) return false;
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

function maskEmail(value: string) {
  const [local, domain] = value.split("@");
  if (!local || !domain) return "•••";
  return `${local.slice(0, 2)}${"•".repeat(Math.max(2, Math.min(8, local.length - 2)))}@${domain}`;
}

function safeErrorCode(error: unknown) {
  const value = error instanceof Error ? error.message : "UNKNOWN_EMAIL_RELAY_ERROR";
  return value.replace(/[^A-Z0-9_:-]/gi, "_").slice(0, 120).toUpperCase();
}

function changedRows(value: unknown) {
  if (!value || typeof value !== "object") return 0;
  const meta = "meta" in value ? (value as { meta?: { changes?: number } }).meta : null;
  return Number(meta?.changes ?? 0);
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export type BetaProgramOverview = Awaited<ReturnType<typeof getBetaProgramOverview>>;
