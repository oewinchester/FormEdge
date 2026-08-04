const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline'",
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
] as const;

const BASE_SECURITY_HEADERS = {
  "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
} as const;

export function securityHeadersForUrl(requestUrl: URL | string): Readonly<Record<string, string>> {
  const url = typeof requestUrl === "string" ? new URL(requestUrl) : requestUrl;
  const secureTransport = url.protocol === "https:";
  const contentSecurityPolicy = secureTransport
    ? [...CONTENT_SECURITY_POLICY, "upgrade-insecure-requests"].join("; ")
    : CONTENT_SECURITY_POLICY.join("; ");

  return {
    ...BASE_SECURITY_HEADERS,
    "Content-Security-Policy": contentSecurityPolicy,
    ...(secureTransport
      ? { "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload" }
      : {}),
  };
}

export function applySecurityHeaders(response: Response, requestUrl: URL | string): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(securityHeadersForUrl(requestUrl))) {
    headers.set(name, value);
  }
  if ((typeof requestUrl === "string" ? new URL(requestUrl) : requestUrl).protocol !== "https:") {
    headers.delete("Strict-Transport-Security");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
