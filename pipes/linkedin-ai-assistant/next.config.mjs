/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['screenpi.pe'],
  },
  experimental: {},
  logging: {
    fetches: {
      fullUrl: false,
    },
  },
  output: 'standalone',
};

export default nextConfig;
