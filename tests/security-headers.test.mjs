import assert from "node:assert/strict";
import test from "node:test";
import { applySecurityHeaders, securityHeadersForUrl } from "../lib/security-headers.ts";

test("production responses receive an enforced, restrictive security baseline", () => {
  const headers = securityHeadersForUrl("https://formedge.example/dashboard");
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.equal(headers["X-Frame-Options"], "DENY");
  assert.equal(headers["Referrer-Policy"], "strict-origin-when-cross-origin");
  assert.match(headers["Strict-Transport-Security"], /max-age=63072000/);
  assert.match(headers["Content-Security-Policy"], /object-src 'none'/);
  assert.match(headers["Content-Security-Policy"], /frame-ancestors 'none'/);
  assert.match(headers["Content-Security-Policy"], /upgrade-insecure-requests/);
  assert.doesNotMatch(headers["Content-Security-Policy"], /\*/);
});

test("local HTTP preview never emits HSTS or upgrades its own assets", () => {
  const headers = securityHeadersForUrl("http://terminal.local:4173/");
  assert.equal(headers["Strict-Transport-Security"], undefined);
  assert.doesNotMatch(headers["Content-Security-Policy"], /upgrade-insecure-requests/);
});

test("security wrapping preserves response semantics and existing headers", async () => {
  const original = new Response("payload", { status: 202, statusText: "Accepted", headers: { "Cache-Control": "private", "Set-Cookie": "session=test; HttpOnly" } });
  const secured = applySecurityHeaders(original, "https://formedge.example/");
  assert.equal(secured.status, 202);
  assert.equal(secured.statusText, "Accepted");
  assert.equal(secured.headers.get("cache-control"), "private");
  assert.equal(secured.headers.get("set-cookie"), "session=test; HttpOnly");
  assert.equal(await secured.text(), "payload");
});
