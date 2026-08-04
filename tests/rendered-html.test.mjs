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
  assert.match(html, /auth\/sign-in/i);
});

test("renders the signed-out Research Feed protection wall", async () => {
  const response = await renderRoute("/admin/research-feed");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Araştırma veri akışı korumalıdır/i);
  assert.match(html, /PUBLIC CSV · RESEARCH ONLY/i);
  assert.match(html, /auth\/sign-in/i);
  assert.match(html, /admin%2Fresearch-feed|admin\/research-feed/i);
});

test("renders the signed-out Shadow Validation protection wall", async () => {
  const response = await renderRoute("/admin/shadow-validation");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Gölge doğrulama paneli korumalıdır/i);
  assert.match(html, /RETROSPECTIVE ≠ LIVE SHADOW/i);
  assert.match(html, /auth\/sign-in/i);
  assert.match(html, /admin%2Fshadow-validation|admin\/shadow-validation/i);
});

test("renders the authenticated Shadow Validation control surface without mock results", async () => {
  const response = await renderRoute("/admin/shadow-validation", {
    "oai-authenticated-user-email": "owner@example.com",
    "oai-authenticated-user-full-name": "FormEdge%20Owner",
    "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
  });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Gerçek veriyi sırayla çek/i);
  assert.match(html, /Bu, canlı shadow sonucu değildir/i);
  assert.match(html, /Henüz stabilite sonucu yok/i);
});

test("renders the signed-out Prediction Ops protection wall", async () => {
  const response = await renderRoute("/admin/predictions");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Tahmin operasyonları korumalıdır/i);
  assert.match(html, /APPEND-ONLY LIFECYCLE/i);
  assert.match(html, /auth\/sign-in/i);
  assert.match(html, /admin%2Fpredictions|admin\/predictions/i);
});

test("renders the signed-out Value Ops protection wall", async () => {
  const response = await renderRoute("/admin/value-ops");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Değer operasyonları korumalıdır/i);
  assert.match(html, /ODDS ≠ PREDICTION/i);
  assert.match(html, /auth\/sign-in/i);
  assert.match(html, /admin%2Fvalue-ops|admin\/value-ops/i);
});

test("renders the signed-out Context Ops protection wall", async () => {
  const response = await renderRoute("/admin/context-ops");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Bağlam operasyonları korumalıdır/i);
  assert.match(html, /BOUNDED CONTEXT RESCORE/i);
  assert.match(html, /auth\/sign-in/i);
});

test("renders the signed-out Notification Ops protection wall", async () => {
  const response = await renderRoute("/admin/notification-ops");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Bildirim operasyonları korumalıdır/i);
  assert.match(html, /IDEMPOTENT OUTBOX/i);
  assert.match(html, /auth\/sign-in/i);
});

test("renders the public controlled-beta waitlist form", async () => {
  const response = await renderRoute("/join");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Bekleme listesine katıl/i);
  assert.match(html, /CONTROLLED BETA/i);
  assert.match(html, /Kart bilgisi/i);
});

test("renders the unified sign-in entry and the real SIWC handoff", async () => {
  const response = await renderRoute("/auth/sign-in?next=%2Fdashboard");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Tek girişle bütün FormEdge panellerine ulaş/i);
  assert.match(html, /ChatGPT ile güvenli giriş/i);
  assert.match(html, /signin-with-chatgpt/i);
  assert.match(html, /Google[\s\S]*Lansmanda/i);
});

test("renders the unified beta account creation entry without fake providers", async () => {
  const response = await renderRoute("/auth/sign-up");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Ücretsiz beta hesabı/i);
  assert.match(html, /kart veya ödeme bilgisi istenmez/i);
  assert.match(html, /ChatGPT ile hesap oluştur/i);
  assert.match(html, /E-posta[\s\S]*Lansmanda/i);
});

test("redirects a signed-out panel hub request through the branded entry", async () => {
  const response = await renderRoute("/portal");
  assert.equal(response.status, 307);
  assert.match(response.headers.get("location") ?? "", /\/auth\/sign-in\?next=%2Fportal$/i);
});

test("renders a fail-closed wall for an invalid beta invitation", async () => {
  const response = await renderRoute("/invite/invalid");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Davet bağlantısı geçersiz/i);
  assert.match(html, /CONTROLLED BETA/i);
  assert.match(html, /HASHED TOKEN · EMAIL MATCH/i);
});

test("renders the signed-out Member Ops protection wall", async () => {
  const response = await renderRoute("/admin/member-ops");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Üyelik operasyonları korumalıdır/i);
  assert.match(html, /PII · ADMIN ONLY/i);
  assert.match(html, /auth\/sign-in/i);
});

test("renders the signed-out member dashboard protection wall", async () => {
  const response = await renderRoute("/dashboard");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Kullanıcı dashboardı giriş gerektirir/i);
  assert.match(html, /D1 PERSISTENT PROFILE/i);
  assert.match(html, /auth\/sign-in/i);
});

test("renders the signed-out immutable performance protection wall", async () => {
  const response = await renderRoute("/dashboard/performance");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Performans geçmişi giriş gerektirir/i);
  assert.match(html, /NO CHERRY PICKING/i);
  assert.match(html, /auth\/sign-in/i);
});

test("renders the signed-out bankroll and coupon protection wall", async () => {
  const response = await renderRoute("/dashboard/bankroll");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Kasa ve kupon alanı giriş gerektirir/i);
  assert.match(html, /TRACKING ONLY · NO PAYMENT/i);
  assert.match(html, /auth\/sign-in/i);
});

test("renders the signed-out notification center protection wall", async () => {
  const response = await renderRoute("/dashboard/notifications");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Bildirim merkezi giriş gerektirir/i);
  assert.match(html, /ACCOUNT-BOUND DELIVERY/i);
  assert.match(html, /auth\/sign-in/i);
});

test("renders the signed-out membership center protection wall", async () => {
  const response = await renderRoute("/dashboard/membership");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Üyelik merkezi giriş gerektirir/i);
  assert.match(html, /ENTITLEMENTS · NO PAYMENT/i);
  assert.match(html, /auth\/sign-in/i);
});

test("renders the signed-out match analysis protection wall", async () => {
  const response = await renderRoute("/dashboard/matches/test-fixture");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Maç analizi giriş gerektirir/i);
  assert.match(html, /RESULTS OPEN/i);
  assert.match(html, /auth\/sign-in/i);
});

async function renderRoute(pathname, requestHeaders = {}) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html", ...requestHeaders } }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}
