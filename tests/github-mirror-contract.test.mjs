import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("checkpoint mirror is repo-scoped, fast-forward only and credential-free", async () => {
  const [hook, setup, push, proxy, packageJson] = await Promise.all([
    readFile(new URL("../.githooks/post-commit", import.meta.url), "utf8"),
    readFile(new URL("../scripts/setup-github-mirror.sh", import.meta.url), "utf8"),
    readFile(new URL("../scripts/push-github-mirror.sh", import.meta.url), "utf8"),
    readFile(new URL("../scripts/ssh-http-connect-proxy.mjs", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(hook, /push-github-mirror\.sh[\s\S]*--hook/);
  assert.match(setup, /ssh:\/\/git@ssh\.github\.com:443\/oewinchester\/FormEdge\.git/);
  assert.match(setup, /api\.github\.com\/meta/);
  assert.match(setup, /ProxyCommand=node/);
  assert.match(proxy, /CONNECT \$\{targetHost\}:\$\{targetPort\}/);
  assert.match(push, /HEAD:refs\/heads\/main/);
  assert.doesNotMatch(push, /--force|force-with-lease/);
  assert.doesNotMatch(`${hook}\n${setup}\n${push}\n${proxy}`, /github_pat_|ghp_/);
  assert.match(packageJson, /"mirror:setup"/);
  assert.match(packageJson, /"mirror:push"/);
  assert.match(packageJson, /"mirror:status"/);
});
