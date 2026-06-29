import { fileURLToPath } from 'node:url';

import withBundleAnalyzer from '@next/bundle-analyzer';
import { withSentryConfig } from '@sentry/nextjs';
import createJiti from 'jiti';
import withNextIntl from 'next-intl/plugin';

const jiti = createJiti(fileURLToPath(import.meta.url));

jiti('./src/libs/Env');

const withNextIntlConfig = withNextIntl('./src/libs/i18n.ts');

const bundleAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

/** @type {import('next').NextConfig} */
export default withSentryConfig(
  bundleAnalyzer(
    withNextIntlConfig({
      eslint: {
        dirs: ['.'],
      },
      poweredByHeader: false,
      reactStrictMode: true,
      experimental: {
        serverComponentsExternalPackages: ['@electric-sql/pglite'],
      },
      images: {
        remotePatterns: [
          {
            protocol: 'https',
            hostname: '32v3ws8ss0.ucarecd.net',
          },
          {
            protocol: 'https',
            hostname: '9c0v643oty.ucarecd.net',
          },
          {
            protocol: 'https',
            hostname: 'ucarecdn.com',
          },
          {
            protocol: 'https',
            hostname: '*.ucarecd.net',
          },
          // Unsplash CDN (for curated theme previews)
          {
            protocol: 'https',
            hostname: 'images.unsplash.com',
          },
          // Unsplash Plus CDN
          {
            protocol: 'https',
            hostname: 'plus.unsplash.com',
          },

          // Pexels
          {
            protocol: 'https',
            hostname: 'images.pexels.com',
          },
          {
            protocol: 'https',
            hostname: 'static.pexels.com',
          },

          // YouTube thumbnails
          {
            protocol: 'https',
            hostname: 'i.ytimg.com',
          },
          {
            protocol: 'https',
            hostname: 'img.youtube.com',
          },
        ],
      },
    }),
  ),
  {
    org: process.env.SENTRY_ORG || 'nativpost',
    project: process.env.SENTRY_PROJECT || 'nativpost-app',

    // Auth token — set SENTRY_AUTH_TOKEN in your environment / CI secrets.
    // Without it, source map upload is disabled (no upload = no warning).
    authToken: process.env.SENTRY_AUTH_TOKEN,

    // Only print upload logs in CI
    silent: !process.env.CI,

    // Source maps: upload when auth token is present, delete after to avoid exposing them.
    // When SENTRY_AUTH_TOKEN is not set, disable upload entirely (silences the warning).
    sourcemaps: {
      deleteSourcemapsAfterUpload: true,
      disable: !process.env.SENTRY_AUTH_TOKEN,
    },

    // Upload a larger set of source maps for prettier stack traces
    widenClientFileUpload: true,

    // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
    tunnelRoute: '/monitoring',

    // Hides source maps from generated client bundles
    hideSourceMaps: true,

    // Automatically tree-shake Sentry logger statements to reduce bundle size
    disableLogger: true,

    // Enables automatic instrumentation of Vercel Cron Monitors.
    automaticVercelMonitors: true,

    // Disable Sentry telemetry
    telemetry: false,
  },
);
