import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@screenpipe/js", "@nextui-org/react"],
  webpack: (config) => {
    return config;
  },
  devIndicators: {
    buildActivity: false,
    appIsrStatus: false
  },
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "X-Api-Key,Content-Type" }
        ]
      }
    ];
  }
};

export default nextConfig;
