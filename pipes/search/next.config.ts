import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ['@screenpipe/js'],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // don't resolve 'fs' module on the client to prevent this error on build --> Error: Can't resolve 'fs'
      config.resolve.fallback = {
        fs: false,
        net: false,
        tls: false,
        child_process: false,
        "stream": false,
        "crypto": false,
        "zlib": false,
        "http": false,
        "https": false,
        "path": false,
      }
    }
    return config
  },
};

export default nextConfig;
