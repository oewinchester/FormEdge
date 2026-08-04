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
  assert.match(shadowStore, /selectHistoricalAutomationCampaign[\s\S]*advanceShadowValidationCampaign/);
  assert.match(shadowStore, /HISTORICAL_AUTOMATION_ACTIVE_KEY/);
});
