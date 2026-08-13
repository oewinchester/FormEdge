import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("forward and historical research automation use separate hourly fail-closed worker contracts", async () => {
  const [viteConfig, worker, route, schema, store, shadowStore] = await Promise.all([
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/shadow-validation/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/research-automation-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/shadow-validation-store.ts", import.meta.url), "utf8"),
  ]);

  assert.match(viteConfig, /crons:\s*\["17 \* \* \* \*", "47 \* \* \* \*"\]/);
  assert.match(worker, /controller\.cron === "47 \* \* \* \*"[\s\S]*runHistoricalValidationAutomationCycle[\s\S]*runResearchAutomationCycle/);
  assert.match(route, /body\.action === "run_automation"/);
  assert.match(route, /body\.action === "run_historical_automation"/);
  assert.match(schema, /forward_shadow_observations_fixture_unique/);
  assert.match(schema, /enum:\s*\["forward_shadow", "historical_validation"\]/);
  assert.match(store, /researchOnly:\s*true/);
  assert.match(store, /recommendationEligible:\s*false/);
  assert.match(store, /getResearchAutomationRuntime\(\)/);
  assert.match(store, /buildSportMonksDateUrls\(nowIso\)/);
  assert.match(store, /buildSportMonksTeamHistoryUrl/);
  assert.match(store, /sportMonksPlanTeamIds/);
  assert.match(store, /fixture-feed-daily-cache-hit/);
  assert.match(store, /sportmonks-v8-stable-team-identity/);
  assert.match(store, /FORECAST_HISTORY_INSUFFICIENT/);
  assert.match(store, /cacheScope:\s*"istanbul_day"/);
  assert.match(store, /research-automation-completed/);
  assert.match(store, /SPORTMONKS_API_TOKEN/);
  assert.match(store, /Authorization: sportMonksAuthorizationHeader\(provider\.token\)/);
  assert.match(store, /SPORTMONKS_UNMAPPABLE_FIXTURES/);
  assert.match(store, /sportmonks-fetch-summary/);
  assert.doesNotMatch(store, /Bearer \$\{provider\.token\}/);
  assert.match(store, /fetchSportMonksFixtures/);
  assert.match(store, /SPORTMONKS_NOT_CONFIGURED/);
  assert.match(store, /SPORTMONKS_EMPTY_WINDOW/);
  assert.match(store, /SPORTMONKS_HISTORY_EMPTY/);
  assert.doesNotMatch(store, /fixture-provider-fallback/);
  assert.doesNotMatch(store, /API_FOOTBALL_API_KEY/);
  assert.doesNotMatch(store, /FOOTBALL_DATA_ORG_API_TOKEN/);
  assert.doesNotMatch(store, /football-data\.org/);
  assert.match(store, /fixture-feed-completed/);
  assert.match(store, /fdfix:\$\{providerKey\}/);
  assert.match(store, /covered_by_sportmonks/);
  assert.doesNotMatch(store, /process\.env\.SPORTMONKS_API_TOKEN/);
  assert.match(store, /summarizeAutomationHealth/);
  assert.match(store, /limit\(120\)/);
  assert.match(store, /const MAX_PREDICTIONS_PER_CYCLE = 60/);
  assert.match(store, /predictionErrors\.length/);
  assert.match(shadowStore, /selectHistoricalAutomationCampaign[\s\S]*advanceShadowValidationCampaign/);
  assert.match(shadowStore, /HISTORICAL_AUTOMATION_ACTIVE_KEY/);
});
