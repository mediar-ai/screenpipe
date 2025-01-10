/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['screenpi.pe'],
  },
  experimental: {},
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
  output: 'standalone',
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push('child_process', 'node-fetch')
    }
    return config
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
};

export default nextConfig;
