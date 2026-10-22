/** @type {import('next').NextConfig} */

/**
 * Security headers.
 *
 * The Content-Security-Policy is *not* set here: it needs a per-request
 * nonce, which the middleware in `src/middleware.ts` generates. Setting a
 * static CSP here as well would produce two CSP headers, and browsers enforce
 * the intersection of both — which would block the inline Next.js bootstrap
 * scripts and leave every page blank.
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        // Authenticated API responses must never be cached by a shared cache.
        source: '/api/:path*',
        headers: [
          ...securityHeaders,
          { key: 'Cache-Control', value: 'private, no-store' },
        ],
      },
    ];
  },
};

export default nextConfig;
