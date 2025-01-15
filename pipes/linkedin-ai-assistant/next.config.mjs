/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['screenpi.pe'],
  },
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push('child_process', 'node-fetch');
    }
    return config;
  },
};

export default nextConfig;

