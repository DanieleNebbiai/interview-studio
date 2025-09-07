import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  
  // Exclude server-only packages from client bundle
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Don't bundle Bull and its dependencies on the client side
      config.externals = config.externals || []
      config.externals.push('bull', 'ioredis')
    }
    return config
  },
};

export default nextConfig;
