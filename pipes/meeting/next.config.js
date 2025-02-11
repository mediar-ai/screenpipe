"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const nextConfig = {
    transpilePackages: ["@screenpipe/js", "@screenpipe/meeting"],
    webpack: (config, {}) => {
        return config;
    },
    devIndicators: {
        buildActivity: false
    },
    // Add headers for CSP
    headers() {
        return __awaiter(this, void 0, void 0, function* () {
            return [
                {
                    source: '/:path*',
                    headers: [
                        {
                            key: 'Content-Security-Policy',
                            value: [
                                "default-src 'self'",
                                "connect-src 'self' wss://api.deepgram.com https://*.posthog.com http://localhost:* ipc:* https://ai-proxy.i-f9f.workers.dev https://api.openai.com",
                                "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'",
                                "style-src 'self' 'unsafe-inline'",
                                "img-src 'self' data: blob:",
                                "font-src 'self' data:"
                            ].join('; ')
                        }
                    ]
                }
            ];
        });
    }
};
exports.default = nextConfig;
