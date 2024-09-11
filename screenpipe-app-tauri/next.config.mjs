/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'export',
}
import { withSentryConfig } from '@sentry/nextjs';

// Wrap the Next.js configuration with Sentry
// module.exports = withSentryConfig(nextConfig);

export default withSentryConfig(nextConfig);