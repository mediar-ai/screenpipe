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
              "connect-src 'self' ws://localhost:* wss://api.deepgram.com https://*.posthog.com http://localhost:* ipc:* https://ai-proxy.i-f9f.workers.dev https://api.openai.com wss://*.ngrok.app",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https://*.posthog.com",
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
