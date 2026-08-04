import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("forward-shadow automation is wired to an hourly fail-closed worker contract", async () => {
  const [viteConfig, worker, route, schema, store] = await Promise.all([
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/shadow-validation/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/research-automation-store.ts", import.meta.url), "utf8"),
  ]);

  assert.match(viteConfig, /crons:\s*\["17 \* \* \* \*"\]/);
  assert.match(worker, /async scheduled[\s\S]*runResearchAutomationCycle/);
  assert.match(route, /body\.action === "run_automation"/);
  assert.match(schema, /forward_shadow_observations_fixture_unique/);
  assert.match(store, /researchOnly:\s*true/);
  assert.match(store, /recommendationEligible:\s*false/);
});
