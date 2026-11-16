import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
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
