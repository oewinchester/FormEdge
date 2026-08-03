import { ModelLabValidationError } from "./model-lab.ts";

export const BETA_ACCESS_POLICY_VERSION = "beta-access-v1" as const;
export const BETA_CAPACITY_MINIMUM = 100 as const;
export const BETA_CAPACITY_MAXIMUM = 300 as const;
export const BETA_DEFAULT_CAPACITY = 100 as const;
export const BETA_INVITATION_TTL_HOURS = 72 as const;

export type PublicIdentityProvider = "chatgpt_siwc";

export type BetaRuntimeSignals = {
  publicSiteAccessConfirmed: boolean;
  publicBetaEnabled: boolean;
  identityProvider: PublicIdentityProvider | null;
  emailRelayConfigured: boolean;
  schedulerConfigured: boolean;
  tokenEncryptionConfigured: boolean;
  networkRateLimitConfigured: boolean;
  appOriginConfigured: boolean;
};

export type BetaReadinessBlocker =
  | "PUBLIC_SITE_ACCESS_UNCONFIRMED"
  | "PUBLIC_BETA_DISABLED"
  | "IDENTITY_PROVIDER_UNAVAILABLE"
  | "EMAIL_RELAY_UNAVAILABLE"
  | "SCHEDULER_UNAVAILABLE"
  | "TOKEN_ENCRYPTION_UNAVAILABLE"
  | "NETWORK_RATE_LIMIT_UNAVAILABLE"
  | "APP_ORIGIN_UNAVAILABLE";

export function evaluateBetaReadiness(signals: BetaRuntimeSignals) {
  const blockers: BetaReadinessBlocker[] = [];
  if (!signals.publicSiteAccessConfirmed) blockers.push("PUBLIC_SITE_ACCESS_UNCONFIRMED");
  if (!signals.publicBetaEnabled) blockers.push("PUBLIC_BETA_DISABLED");
  if (signals.identityProvider !== "chatgpt_siwc") blockers.push("IDENTITY_PROVIDER_UNAVAILABLE");
  if (!signals.emailRelayConfigured) blockers.push("EMAIL_RELAY_UNAVAILABLE");
  if (!signals.schedulerConfigured) blockers.push("SCHEDULER_UNAVAILABLE");
  if (!signals.tokenEncryptionConfigured) blockers.push("TOKEN_ENCRYPTION_UNAVAILABLE");
  if (!signals.networkRateLimitConfigured) blockers.push("NETWORK_RATE_LIMIT_UNAVAILABLE");
  if (!signals.appOriginConfigured) blockers.push("APP_ORIGIN_UNAVAILABLE");
  return {
    policyVersion: BETA_ACCESS_POLICY_VERSION,
    ready: blockers.length === 0,
    blockers,
    checks: {
      publicSiteAccess: signals.publicSiteAccessConfirmed,
      publicBeta: signals.publicBetaEnabled,
      identityProvider: signals.identityProvider === "chatgpt_siwc",
      emailRelay: signals.emailRelayConfigured,
      scheduler: signals.schedulerConfigured,
      tokenEncryption: signals.tokenEncryptionConfigured,
      networkRateLimit: signals.networkRateLimitConfigured,
      appOrigin: signals.appOriginConfigured,
    },
    supportedIdentityProvider: signals.identityProvider,
    plannedIdentityProviders: ["google", "apple", "email_password"] as const,
  };
}

export function normalizeBetaProgramUpdate(input: {
  capacityLimit?: unknown;
  invitationsEnabled?: unknown;
}) {
  const capacityLimit = Number(input.capacityLimit);
  if (!Number.isInteger(capacityLimit)
    || capacityLimit < BETA_CAPACITY_MINIMUM
    || capacityLimit > BETA_CAPACITY_MAXIMUM) {
    throw new ModelLabValidationError(
      `Beta kapasitesi ${BETA_CAPACITY_MINIMUM} ile ${BETA_CAPACITY_MAXIMUM} arasında tam sayı olmalıdır.`,
    );
  }
  if (typeof input.invitationsEnabled !== "boolean") {
    throw new ModelLabValidationError("Davet durumu boolean olmalıdır.");
  }
  return { capacityLimit, invitationsEnabled: input.invitationsEnabled };
}

export function invitationWindow(startedAt: string) {
  const startedMs = parseIso(startedAt, "startedAt");
  return {
    createdAt: new Date(startedMs).toISOString(),
    expiresAt: new Date(startedMs + BETA_INVITATION_TTL_HOURS * 3_600_000).toISOString(),
  };
}

export function fixedWindowStart(now: string, windowSeconds: number) {
  const nowMs = parseIso(now, "now");
  if (!Number.isInteger(windowSeconds) || windowSeconds < 1) {
    throw new ModelLabValidationError("Rate-limit penceresi pozitif tam sayı olmalıdır.");
  }
  const windowMs = windowSeconds * 1_000;
  return new Date(Math.floor(nowMs / windowMs) * windowMs).toISOString();
}

export function evaluateInvitationAcceptance(input: {
  status: "queued" | "sent" | "accepted" | "expired" | "revoked" | "failed";
  expiresAt: string;
  invitationEmail: string;
  userEmail: string;
  now?: string;
}) {
  const nowMs = parseIso(input.now ?? new Date().toISOString(), "now");
  const expiresMs = parseIso(input.expiresAt, "expiresAt");
  const emailMatches = input.invitationEmail.trim().toLowerCase() === input.userEmail.trim().toLowerCase();
  const alreadyAccepted = input.status === "accepted";
  const activeStatus = input.status === "queued" || input.status === "sent" || alreadyAccepted;
  const expired = expiresMs <= nowMs || input.status === "expired";
  const blockers: string[] = [];
  if (!emailMatches) blockers.push("EMAIL_MISMATCH");
  if (!activeStatus) blockers.push("INVITATION_INACTIVE");
  if (expired) blockers.push("INVITATION_EXPIRED");
  return {
    eligible: blockers.length === 0,
    emailMatches,
    alreadyAccepted,
    expired,
    blockers,
  };
}

export function validateInvitationToken(value: string) {
  const token = value.trim();
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) {
    throw new ModelLabValidationError("Davet bağlantısı geçersizdir.");
  }
  return token;
}

function parseIso(value: string, field: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new ModelLabValidationError(`${field} geçerli ISO zamanı olmalıdır.`);
  return parsed;
}
