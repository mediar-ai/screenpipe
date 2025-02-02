import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@screenpipe/js"],
  webpack: (config, { }) => {
    return config;
  },
  devIndicators: {
    buildActivity: false
  }
};

export default nextConfig;
