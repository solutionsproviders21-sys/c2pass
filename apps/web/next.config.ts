import type { NextConfig } from 'next';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

// Limits what an injected script could do with the session (tokens live in localStorage): no outside
// connections, no foreign scripts or frames. Next's inline bootstrap scripts need 'unsafe-inline'; dev mode also needs eval.
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.tile.openstreetmap.org",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'self' blob: data:",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const config: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@c2pass/shared'],
  poweredByHeader: false,
  // The browser talks to /api on the same origin; Next forwards to the NestJS API.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/api/:path*` }];
  },
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'Content-Security-Policy', value: CSP },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=(self)' },
      ],
    }, {
      // The service worker must always be revalidated so fixes reach installed apps.
      source: '/sw.js',
      headers: [{ key: 'Cache-Control', value: 'no-cache' }],
    }];
  },
};

export default config;
