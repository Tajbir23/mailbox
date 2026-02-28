/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // ── Performance ──
  poweredByHeader: false,                   // Remove X-Powered-By header
  compress: true,                           // Enable gzip compression
  productionBrowserSourceMaps: false,       // Smaller prod bundles

  // ── Image optimization (future-proof) ──
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30,    // 30 days
  },

  // ── Compiler optimizations ──
  compiler: {
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false,
  },

  // ── Webpack optimizations ──
  webpack: (config, { isServer }) => {
    // Don't bundle Node.js dns/net/tls modules on the client
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        dns: false,
        net: false,
        tls: false,
        fs: false,
      };
    }
    return config;
  },

  // ── Security headers (backup — middleware is primary) ──
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
      {
        // Cache static assets aggressively
        source: "/(.*)\\.(js|css|woff2|woff|ttf|eot|svg|png|jpg|jpeg|gif|ico|webp|avif)$",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },

  // ── Experimental performance features ──
  experimental: {
    optimizePackageImports: ["next-auth", "mongoose"],
  },
};

module.exports = nextConfig;
