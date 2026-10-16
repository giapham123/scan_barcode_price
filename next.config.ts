import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  env: {
    // Where products and photos are kept (see src/lib/server/container.ts).
    // Fixed at build time: Netlify sets NETLIFY=true while building, and has no
    // permanent disk, so its builds use Netlify Blobs; everywhere else uses ./data.
    STORAGE: process.env.STORAGE || (process.env.NETLIFY === 'true' ? 'netlify-blobs' : 'file'),
  },
};

export default nextConfig;
