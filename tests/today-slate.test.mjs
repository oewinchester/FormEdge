import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  assessLiveSlateFreshness,
  getIstanbulSlateWindow,
  slateDayLabel,
} from "../lib/today-slate.ts";

test("Istanbul slate window starts at local midnight and spans today plus 48 hours", () => {
  const window = getIstanbulSlateWindow("2026-08-10T17:30:00.000Z");
  assert.deepEqual(window, {
    startIso: "2026-08-09T21:00:00.000Z",
    todayEndIso: "2026-08-10T20:59:59.999Z",
    endIso: "2026-08-12T20:59:59.999Z",
  });
  assert.equal(slateDayLabel("2026-08-10T18:00:00.000Z", window), "today");
  assert.equal(slateDayLabel("2026-08-11T18:00:00.000Z", window), "tomorrow");
  assert.equal(slateDayLabel("2026-08-12T18:00:00.000Z", window), "later");
});

test("live slate freshness is explicit and fail-closed", () => {
  assert.equal(assessLiveSlateFreshness({
    generatedAt: "2026-08-10T12:00:00.000Z",
    capturedAt: "2026-08-10T11:00:00.000Z",
    status: "imported",
    sourceRowCount: 12,
  }).level, "fresh");
  assert.equal(assessLiveSlateFreshness({
    generatedAt: "2026-08-10T12:00:00.000Z",
    capturedAt: "2026-08-10T11:00:00.000Z",
    status: "imported",
    sourceRowCount: 0,
  }).level, "empty");
  assert.equal(assessLiveSlateFreshness({
    generatedAt: "2026-08-10T12:00:00.000Z",
    capturedAt: "2026-08-08T12:00:00.000Z",
    status: "imported",
    sourceRowCount: 12,
  }).level, "stale");
  assert.equal(assessLiveSlateFreshness({
    generatedAt: "2026-08-10T12:00:00.000Z",
    capturedAt: null,
    status: "never_run",
  }).level, "missing");
});

test("dashboard exposes research fixtures without weakening recommendation gates", async () => {
  const [store, route, dashboard] = await Promise.all([
    readFile(new URL("../lib/user-dashboard-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/dashboard/live-slate/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/dashboard/user-dashboard.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(store, /researchRecordsShownWithLabel:\s*true/);
  assert.match(store, /recommendationGatePreserved:\s*true/);
  assert.match(store, /!thread\.researchOnly[\s\S]*!version\.researchOnly/);
  assert.match(store, /SportMonks Football API v3/);
  assert.match(store, /API-Football v3/);
  assert.match(store, /importedFixtureCount:\s*latestFeed\?\.pilotRowCount/);
  assert.match(route, /actor\.role !== "admin"/);
  assert.match(route, /runResearchAutomationCycle\(actor, "admin"\)/);
  assert.match(dashboard, /Bugünün maç merkezi/);
  assert.match(dashboard, /source\.importedFixtureCount/);
  assert.match(dashboard, /Bahis önerisi değil/);
});
