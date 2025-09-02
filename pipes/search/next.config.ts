import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	transpilePackages: ["@screenpipe/js"],
	webpack: (config, {}) => {
		// TODO: remove this in when merging
		config.resolve.symlinks = true;
		return config;
	},
	devIndicators: {
		buildActivity: false,
		appIsrStatus: false,
	},
	// Experimental features to help with hydration
	experimental: {
		// Remove optimizeCss as it requires additional dependencies
		// optimizeCss: true,
	},
	// Compiler options for better hydration handling
	compiler: {
		// Remove console.logs in production but keep hydration warnings in dev
		removeConsole: process.env.NODE_ENV === "production" ? {
			exclude: ["error", "warn"]
		} : false,
	},
};

export default nextConfig;
