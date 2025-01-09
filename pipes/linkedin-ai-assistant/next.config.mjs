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
};

export default nextConfig;
