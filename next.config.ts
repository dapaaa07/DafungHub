import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  // Low-RAM optimizations for 1.5GB cPanel shared hosting:
  // 1. Disable runtime image resizing (sharp allocates 100-250MB native RAM)
  // 2. Disable Node gzip (Cloudflare & LiteSpeed already handle Brotli/Gzip)
  // 3. Cap Next.js internal in-memory cache to 10MB (default is 50MB)
  images: {
    unoptimized: true,
  },
  compress: false,
  productionBrowserSourceMaps: false,
  cacheMaxMemorySize: 10 * 1024 * 1024,
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    cpus: 1,
    workerThreads: false,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-LiteSpeed-Cache-Control',
            value: 'no-cache',
          },
        ],
      },
      {
        source: '/account/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, no-cache, no-store, max-age=0, must-revalidate',
          },
          {
            key: 'X-LiteSpeed-Cache-Control',
            value: 'no-cache, no-store',
          },
        ],
      },
      {
        source: '/orders/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, no-cache, no-store, max-age=0, must-revalidate',
          },
          {
            key: 'X-LiteSpeed-Cache-Control',
            value: 'no-cache, no-store',
          },
        ],
      },
    ];
  },
  turbopack: {
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
