import type { Metadata } from 'next';

// -----------------------------------------------------------
// NativPost Metadata Helper
//
// Usage — public page:
//   export const metadata = createMetadata({
//     title: 'Pricing',
//     description: 'Simple, transparent pricing for every team size.',
//   });
//
// Usage — auth-only page (noindex):
//   export const metadata = createMetadata({
//     title: 'Dashboard',
//     noIndex: true,
//   });
//
// Usage — dynamic page:
//   export async function generateMetadata({ params }) {
//     return createMetadata({ title: post.title, description: post.caption });
//   }
// -----------------------------------------------------------

const SITE_NAME = 'NativPost';
const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.nativpost.com';
const SITE_DESCRIPTION = 'Studio-quality social content for your brand. AI-powered content generation, scheduling, and publishing — built for agencies and growing businesses.';
const OG_IMAGE = `${SITE_URL}/og-image.png`;

type MetadataOptions = {
  // Page title — appended with " | NativPost"
  title?: string;
  // Page description — falls back to site description
  description?: string;
  // Path relative to SITE_URL, e.g. "/pricing"
  // Used for canonical URL
  path?: string;
  // Open Graph image override
  ogImage?: string;
  // Prevent indexing — always true for authenticated pages
  noIndex?: boolean;
};

export function createMetadata(options: MetadataOptions = {}): Metadata {
  const {
    title,
    description = SITE_DESCRIPTION,
    path = '',
    ogImage = OG_IMAGE,
    noIndex = false,
  } = options;

  const fullTitle = title ? `${title} | ${SITE_NAME}` : SITE_NAME;
  const canonicalUrl = `${SITE_URL}${path}`;

  return {
    title: fullTitle,
    description,
    metadataBase: new URL(SITE_URL),

    // Canonical URL
    alternates: {
      canonical: canonicalUrl,
    },

    // Open Graph
    openGraph: {
      title: fullTitle,
      description,
      url: canonicalUrl,
      siteName: SITE_NAME,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: fullTitle,
        },
      ],
      type: 'website',
      locale: 'en_US',
    },

    // Twitter / X card
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
      images: [ogImage],
      creator: '@nativpost',
      site: '@nativpost',
    },

    // Robots
    robots: noIndex
      ? { index: false, follow: false }
      : { index: true, follow: true, googleBot: { index: true, follow: true } },

    // Verification tags — add when you set up Search Console
    // verification: {
    //   google: 'your-google-site-verification',
    // },
  };
}

// Shorthand for dashboard/auth pages — always noindex
export function createDashboardMetadata(title: string): Metadata {
  return createMetadata({ title, noIndex: true });
}
