import nextra from 'nextra';
import withMDX from '@next/mdx';

const config = withMDX({
  extension: /\.mdx?$/,
});

const withNextra = nextra({
  theme: 'nextra-theme-docs',
  themeConfig: './theme.config.tsx',
  standalone: true,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...config,
  pageExtensions: ['js', 'jsx', 'ts', 'tsx', 'md', 'mdx'],
  reactStrictMode: true,
  ...withNextra(),
};

export default nextConfig;