import { NextResponse } from "next/server";

/**
 * Next.js Middleware – Runs on every request (edge runtime).
 *
 * Security headers:
 *  - Content-Security-Policy
 *  - X-Content-Type-Options
 *  - X-Frame-Options
 *  - X-XSS-Protection
 *  - Referrer-Policy
 *  - Permissions-Policy
 *  - Strict-Transport-Security
 *
 * Also adds:
 *  - Request ID for tracing
 *  - Rate-limit headers hint (actual enforcement in API routes)
 */

export function middleware(request) {
  const response = NextResponse.next();
  const { pathname } = request.nextUrl;

  // ── Security Headers ──
  // Strict CSP: allow self, inline styles (Tailwind), Google Fonts, wss for socket
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' ws: wss: http: https:",
    "frame-src blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");

  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()"
  );
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload"
  );
  response.headers.set("X-DNS-Prefetch-Control", "on");

  // Remove server identification
  response.headers.delete("X-Powered-By");
  response.headers.delete("Server");

  // Request ID for tracing/debugging
  const requestId = crypto.randomUUID();
  response.headers.set("X-Request-Id", requestId);

  // ── API Route Protection ──
  if (pathname.startsWith("/api/")) {
    // Prevent caching of API responses
    response.headers.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate"
    );
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
  }

  return response;
}

// Match all routes except static assets and _next internals
export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public files (svg, png, jpg, etc.)
     */
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
