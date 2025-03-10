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
};

export default nextConfig;
