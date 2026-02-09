import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@auto-trpg/shared-types', '@auto-trpg/utils', '@auto-trpg/ui'],
};

export default nextConfig;
