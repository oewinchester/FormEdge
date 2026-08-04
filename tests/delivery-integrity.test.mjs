import assert from "node:assert/strict";
import test from "node:test";
import { buildReadinessReport } from "../scripts/readiness-report.mjs";
import { findHighConfidenceSecrets } from "../scripts/scan-repository-secrets.mjs";
import { verifyMigrationIntegrity } from "../scripts/verify-migrations.mjs";

test("the committed migration chain is complete and deterministic", async () => {
  const report = await verifyMigrationIntegrity(new URL("..", import.meta.url));
  assert.equal(report.dialect, "sqlite");
  assert.ok(report.count > 0);
  assert.match(report.sha256, /^[a-f0-9]{64}$/);
});

test("the readiness report exposes state but never secret values", () => {
  const marker = (label) => `${label}-marker-${"x".repeat(32)}9`;
  const privateMarkers = {
    INVITE_EMAIL_TOKEN: marker("relay"), INVITE_TOKEN_SECRET: marker("invite"), WAITLIST_RATE_LIMIT_SECRET: marker("rate"),
    MEMBERSHIP_SCHEDULER_SECRET: marker("schedule"), VAPID_PRIVATE_KEY: marker("vapid"), TELEGRAM_BOT_TOKEN: marker("telegram"),
    TELEGRAM_WEBHOOK_SECRET: marker("webhook"),
  };
  const report = buildReadinessReport({
    ...privateMarkers,
    FORMEDGE_OWNER_EMAIL: "owner@example.com", PUBLIC_SITE_ACCESS_CONFIRMED: "true", PUBLIC_BETA_ENABLED: "true",
    PUBLIC_IDENTITY_PROVIDER: "chatgpt_siwc", PUBLIC_APP_ORIGIN: "https://formedge.example",
    INVITE_EMAIL_ENDPOINT: "https://relay.example/send", INVITE_EMAIL_FROM: "beta@formedge.example",
    VAPID_PUBLIC_KEY: "public-marker", VAPID_SUBJECT: "mailto:ops@formedge.example", TELEGRAM_BOT_USERNAME: "FormEdgeBot",
  });
  const serialized = JSON.stringify(report);
  assert.equal(report.launchReady, true);
  for (const markerValue of Object.values(privateMarkers)) assert.doesNotMatch(serialized, new RegExp(markerValue));
});

test("the secret detector reports credential classes without returning credential text", () => {
  const candidate = ["github", "pat", "A".repeat(64)].join("_");
  const findings = findHighConfidenceSecrets(`token=${candidate}`);
  assert.ok(findings.includes("github-fine-grained-pat"));
  assert.doesNotMatch(JSON.stringify(findings), /A{20}/);
});
