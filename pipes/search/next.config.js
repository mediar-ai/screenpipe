"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const nextConfig = {
    transpilePackages: ["@screenpipe/js"],
    webpack: (config, {}) => {
        return config;
    },
    devIndicators: {
        buildActivity: false,
        appIsrStatus: false
    }
};
exports.default = nextConfig;
