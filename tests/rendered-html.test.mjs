import assert from "node:assert/strict";
import test from "node:test";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

test("renders development preview metadata", async () => {
  const response = await renderRoute("/");

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  assert.match(await response.text(), developmentPreviewMeta);
});

test("renders the signed-out Model Lab protection wall", async () => {
  const response = await renderRoute("/admin/model-lab");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Model laboratuvarı korumalıdır/i);
  assert.match(html, /POINT-IN-TIME ONLY/i);
  assert.match(html, /signin-with-chatgpt/i);
});

test("renders the signed-out Prediction Ops protection wall", async () => {
  const response = await renderRoute("/admin/predictions");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Tahmin operasyonları korumalıdır/i);
  assert.match(html, /APPEND-ONLY LIFECYCLE/i);
  assert.match(html, /signin-with-chatgpt/i);
  assert.match(html, /admin%2Fpredictions|admin\/predictions/i);
});

test("renders the signed-out Value Ops protection wall", async () => {
  const response = await renderRoute("/admin/value-ops");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Değer operasyonları korumalıdır/i);
  assert.match(html, /ODDS ≠ PREDICTION/i);
  assert.match(html, /signin-with-chatgpt/i);
  assert.match(html, /admin%2Fvalue-ops|admin\/value-ops/i);
});

test("renders the signed-out member dashboard protection wall", async () => {
  const response = await renderRoute("/dashboard");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Kullanıcı dashboardı giriş gerektirir/i);
  assert.match(html, /D1 PERSISTENT PROFILE/i);
  assert.match(html, /signin-with-chatgpt/i);
});

test("renders the signed-out immutable performance protection wall", async () => {
  const response = await renderRoute("/dashboard/performance");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Performans geçmişi giriş gerektirir/i);
  assert.match(html, /NO CHERRY PICKING/i);
  assert.match(html, /signin-with-chatgpt/i);
});

test("renders the signed-out match analysis protection wall", async () => {
  const response = await renderRoute("/dashboard/matches/test-fixture");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Maç analizi giriş gerektirir/i);
  assert.match(html, /RESULTS OPEN/i);
  assert.match(html, /signin-with-chatgpt/i);
});

async function renderRoute(pathname) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}
