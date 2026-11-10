import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  logging: { incomingRequests: { ignore: [/^\/api\/auth\//, /^\/login\/error/] } },
  typescript: { ignoreBuildErrors: false },
  output: 'standalone',
  transpilePackages: ['motion'],
};

export default nextConfig;
