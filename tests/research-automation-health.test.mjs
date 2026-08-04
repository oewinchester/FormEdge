import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateResearchOperationsGate,
  summarizeAutomationHealth,
} from "../lib/research-automation-health.ts";

const now = "2026-08-04T12:00:00.000Z";

test("automation health is honest before the first persisted run", () => {
  assert.deepEqual(summarizeAutomationHealth([], now), {
    status: "not_started",
    totalRuns: 0,
    completedRuns: 0,
    failedRuns: 0,
    consecutiveFailures: 0,
    successRate: null,
    averageDurationMs: null,
    maximumDurationMs: null,
    lastStartedAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
  });
});

test("recent successful runs expose rate and real duration statistics", () => {
  const health = summarizeAutomationHealth([
    { status: "completed", startedAt: "2026-08-04T11:47:00.000Z", completedAt: "2026-08-04T11:48:00.000Z" },
    { status: "completed", startedAt: "2026-08-04T10:47:00.000Z", completedAt: "2026-08-04T10:49:00.000Z" },
  ], now);
  assert.equal(health.status, "healthy");
  assert.equal(health.successRate, 1);
  assert.equal(health.averageDurationMs, 90_000);
  assert.equal(health.maximumDurationMs, 120_000);
});

test("partial and failed terminal runs degrade health and count consecutive failures", () => {
  const health = summarizeAutomationHealth([
    { status: "failed", startedAt: "2026-08-04T11:47:00.000Z", completedAt: "2026-08-04T11:47:30.000Z" },
    { status: "partial", startedAt: "2026-08-04T10:47:00.000Z", completedAt: "2026-08-04T10:48:00.000Z" },
    { status: "completed", startedAt: "2026-08-04T09:47:00.000Z", completedAt: "2026-08-04T09:48:00.000Z" },
  ], now);
  assert.equal(health.status, "degraded");
  assert.equal(health.consecutiveFailures, 2);
  assert.equal(health.successRate, 1 / 3);
});

test("an hourly worker becomes stale only after the explicit grace window", () => {
  const health = summarizeAutomationHealth([
    { status: "completed", startedAt: "2026-08-04T08:47:00.000Z", completedAt: "2026-08-04T08:48:00.000Z" },
  ], now);
  assert.equal(health.status, "stale");
});

test("research operations stay blocked until both workers have current persisted evidence", () => {
  const healthy = summarizeAutomationHealth([
    { status: "completed", startedAt: "2026-08-04T11:47:00.000Z", completedAt: "2026-08-04T11:48:00.000Z" },
  ], now);
  const notStarted = summarizeAutomationHealth([], now);
  assert.deepEqual(evaluateResearchOperationsGate(healthy, notStarted), {
    status: "blocked",
    healthyWorkers: 1,
    workerCount: 2,
    blockerCodes: ["HISTORICAL_NOT_STARTED"],
    researchOnly: true,
    recommendationEligible: false,
  });
});

test("degraded research operations never masquerade as healthy or recommendation eligible", () => {
  const healthy = summarizeAutomationHealth([
    { status: "completed", startedAt: "2026-08-04T11:47:00.000Z", completedAt: "2026-08-04T11:48:00.000Z" },
  ], now);
  const degraded = summarizeAutomationHealth([
    { status: "partial", startedAt: "2026-08-04T11:17:00.000Z", completedAt: "2026-08-04T11:18:00.000Z" },
  ], now);
  const gate = evaluateResearchOperationsGate(degraded, healthy);
  assert.equal(gate.status, "watch");
  assert.deepEqual(gate.blockerCodes, ["FORWARD_DEGRADED"]);
  assert.equal(gate.recommendationEligible, false);
});

test("current successful workers open only the research operations gate", () => {
  const healthy = summarizeAutomationHealth([
    { status: "completed", startedAt: "2026-08-04T11:47:00.000Z", completedAt: "2026-08-04T11:48:00.000Z" },
  ], now);
  const gate = evaluateResearchOperationsGate(healthy, healthy);
  assert.equal(gate.status, "operational");
  assert.equal(gate.healthyWorkers, 2);
  assert.equal(gate.researchOnly, true);
  assert.equal(gate.recommendationEligible, false);
});
