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
            value: [
              "default-src 'self'",
              "connect-src 'self' " + 
                "wss://api.deepgram.com " +
                "https://api.deepgram.com " +
                "wss://*.posthog.com " +
                "https://*.posthog.com " +
                "http://localhost:* " +
                "ws://localhost:* " +
                "wss://*.ngrok-free.app " +
                "ws://*.ngrok-free.app " +
                "https://*.ngrok-free.app " +
                "ipc:* " +
                "ipc://localhost/* " +
                "https://ai-proxy.i-f9f.workers.dev " +
                "https://api.openai.com",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:"
            ].join('; ')
          }
        ]
      }
    ]
  }
};

export default nextConfig;
