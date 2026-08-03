import assert from "node:assert/strict";
import test from "node:test";
import {
  BETA_INVITATION_TTL_HOURS,
  evaluateBetaReadiness,
  evaluateInvitationAcceptance,
  fixedWindowStart,
  invitationWindow,
  normalizeBetaProgramUpdate,
  validateInvitationToken,
} from "../lib/beta-access-engine.ts";

test("beta readiness fails closed until every external gate is explicit", () => {
  const blocked = evaluateBetaReadiness({
    publicSiteAccessConfirmed: false,
    publicBetaEnabled: false,
    identityProvider: null,
    emailRelayConfigured: false,
    schedulerConfigured: false,
    tokenEncryptionConfigured: false,
    networkRateLimitConfigured: false,
    appOriginConfigured: false,
  });
  assert.equal(blocked.ready, false);
  assert.equal(blocked.blockers.length, 8);
  const ready = evaluateBetaReadiness({
    publicSiteAccessConfirmed: true,
    publicBetaEnabled: true,
    identityProvider: "chatgpt_siwc",
    emailRelayConfigured: true,
    schedulerConfigured: true,
    tokenEncryptionConfigured: true,
    networkRateLimitConfigured: true,
    appOriginConfigured: true,
  });
  assert.equal(ready.ready, true);
});

test("beta capacity is constrained to the approved 100–300 range", () => {
  assert.deepEqual(normalizeBetaProgramUpdate({ capacityLimit: 100, invitationsEnabled: false }), {
    capacityLimit: 100,
    invitationsEnabled: false,
  });
  assert.throws(() => normalizeBetaProgramUpdate({ capacityLimit: 99, invitationsEnabled: true }));
  assert.throws(() => normalizeBetaProgramUpdate({ capacityLimit: 301, invitationsEnabled: true }));
});

test("invitation window is exactly 72 hours", () => {
  const window = invitationWindow("2026-08-04T00:00:00.000Z");
  assert.equal(BETA_INVITATION_TTL_HOURS, 72);
  assert.equal(window.expiresAt, "2026-08-07T00:00:00.000Z");
});

test("invitation acceptance requires matching identity, active state and time", () => {
  const base = {
    status: "sent",
    expiresAt: "2026-08-07T00:00:00.000Z",
    invitationEmail: "member@example.com",
    now: "2026-08-05T00:00:00.000Z",
  };
  assert.equal(evaluateInvitationAcceptance({ ...base, userEmail: "MEMBER@example.com" }).eligible, true);
  assert.deepEqual(
    evaluateInvitationAcceptance({ ...base, userEmail: "other@example.com" }).blockers,
    ["EMAIL_MISMATCH"],
  );
  assert.equal(evaluateInvitationAcceptance({ ...base, userEmail: base.invitationEmail, now: "2026-08-08T00:00:00.000Z" }).eligible, false);
  const alreadyAccepted = evaluateInvitationAcceptance({
    ...base,
    status: "accepted",
    userEmail: base.invitationEmail,
  });
  assert.equal(alreadyAccepted.alreadyAccepted, true);
  assert.equal(alreadyAccepted.emailMatches, true);
});

test("rate windows and invite tokens are deterministic and strict", () => {
  assert.equal(fixedWindowStart("2026-08-04T00:09:59.999Z", 600), "2026-08-04T00:00:00.000Z");
  assert.equal(validateInvitationToken("A".repeat(43)), "A".repeat(43));
  assert.throws(() => validateInvitationToken("short"));
});
