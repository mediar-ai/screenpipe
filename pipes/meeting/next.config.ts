import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@screenpipe/js", "@screenpipe/meeting"],
  webpack: (config, { }) => {
    return config;
  },
  devIndicators: {
    buildActivity: false
  },
  // Add headers for CSP
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "script-src 'self' 'unsafe-inline' 'unsafe-eval';"
          }
        ]
      }
    ]
  }
};

export default nextConfig;
