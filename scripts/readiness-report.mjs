import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);

export function buildReadinessReport(env = process.env) {
  const checks = {
    configuredOwner: hasConfiguredOwner(env.FORMEDGE_OWNER_EMAIL, env.FORMEDGE_OWNER_EMAILS),
    publicSiteAccessConfirmed: flagEnabled(env.PUBLIC_SITE_ACCESS_CONFIRMED),
    publicBetaEnabled: flagEnabled(env.PUBLIC_BETA_ENABLED),
    chatGptIdentity: env.PUBLIC_IDENTITY_PROVIDER?.trim() === "chatgpt_siwc",
    appOriginHttps: validHttpsUrl(env.PUBLIC_APP_ORIGIN, true),
    invitationEndpointHttps: validHttpsUrl(env.INVITE_EMAIL_ENDPOINT),
    invitationRelayToken: nonEmpty(env.INVITE_EMAIL_TOKEN),
    invitationFromAddress: validEmail(env.INVITE_EMAIL_FROM),
    invitationTokenSecret: secretAtLeast(env.INVITE_TOKEN_SECRET, 32),
    waitlistRateLimitSecret: secretAtLeast(env.WAITLIST_RATE_LIMIT_SECRET, 32),
    membershipSchedulerSecret: secretAtLeast(env.MEMBERSHIP_SCHEDULER_SECRET, 32),
    browserPush: nonEmpty(env.VAPID_PUBLIC_KEY) && nonEmpty(env.VAPID_PRIVATE_KEY) && nonEmpty(env.VAPID_SUBJECT),
    telegram: nonEmpty(env.TELEGRAM_BOT_TOKEN) && nonEmpty(env.TELEGRAM_BOT_USERNAME) && secretAtLeast(env.TELEGRAM_WEBHOOK_SECRET, 32),
  };
  const categories = {
    ownership: category(true, { configuredOwner: checks.configuredOwner }),
    publicBeta: category(true, { publicSiteAccessConfirmed: checks.publicSiteAccessConfirmed, publicBetaEnabled: checks.publicBetaEnabled, chatGptIdentity: checks.chatGptIdentity, appOriginHttps: checks.appOriginHttps }),
    invitationSecurity: category(true, { invitationTokenSecret: checks.invitationTokenSecret, waitlistRateLimitSecret: checks.waitlistRateLimitSecret, membershipSchedulerSecret: checks.membershipSchedulerSecret }),
    invitationRelay: category(true, { invitationEndpointHttps: checks.invitationEndpointHttps, invitationRelayToken: checks.invitationRelayToken, invitationFromAddress: checks.invitationFromAddress }),
    optionalNotifications: category(false, { browserPush: checks.browserPush, telegram: checks.telegram }),
  };
  const blockerCodes = {
    configuredOwner: "OWNER_NOT_CONFIGURED",
    publicSiteAccessConfirmed: "PUBLIC_SITE_ACCESS_NOT_CONFIRMED",
    publicBetaEnabled: "PUBLIC_BETA_DISABLED",
    chatGptIdentity: "IDENTITY_PROVIDER_NOT_READY",
    appOriginHttps: "APP_ORIGIN_NOT_READY",
    invitationTokenSecret: "INVITATION_TOKEN_SECRET_NOT_READY",
    waitlistRateLimitSecret: "WAITLIST_RATE_LIMIT_SECRET_NOT_READY",
    membershipSchedulerSecret: "MEMBERSHIP_SCHEDULER_SECRET_NOT_READY",
    invitationEndpointHttps: "INVITATION_ENDPOINT_NOT_READY",
    invitationRelayToken: "INVITATION_RELAY_TOKEN_NOT_READY",
    invitationFromAddress: "INVITATION_FROM_ADDRESS_NOT_READY",
  };
  const blockers = Object.entries(blockerCodes).filter(([check]) => !checks[check]).map(([, code]) => code);
  const warnings = [...(!checks.browserPush ? ["BROWSER_PUSH_NOT_CONFIGURED"] : []), ...(!checks.telegram ? ["TELEGRAM_NOT_CONFIGURED"] : [])];
  return { schemaVersion: "delivery-readiness-v1", launchReady: blockers.length === 0, categories, blockers, warnings };
}

function category(required, checks) { return { required, ready: Object.values(checks).every(Boolean), checks }; }
function flagEnabled(value) { return value?.trim().toLowerCase() === "true"; }
function nonEmpty(value) { return typeof value === "string" && value.trim().length > 0; }
function secretAtLeast(value, length) { return typeof value === "string" && value.length >= length; }
function validEmail(value) { return nonEmpty(value) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()); }
function hasConfiguredOwner(...values) { return values.flatMap((value) => typeof value === "string" ? value.split(",") : []).some((value) => validEmail(value)); }
function validHttpsUrl(value, originOnly = false) {
  if (!nonEmpty(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (!originOnly || url.href === `${url.origin}/`);
  } catch { return false; }
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  const report = buildReadinessReport();
  console.log(JSON.stringify(report, null, 2));
  if (process.argv.includes("--strict") && !report.launchReady) process.exitCode = 1;
}
