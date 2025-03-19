/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // Add support for raw-loader to import file content as strings
    config.module.rules.push({
      test: /\.(tsx|ts|js|jsx)$/,
      resourceQuery: /raw/,
      type: 'asset/source',
    });
    
    return config;
  },
};

export default nextConfig;
