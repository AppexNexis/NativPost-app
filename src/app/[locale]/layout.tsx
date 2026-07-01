import '@/styles/global.css';

import type { Metadata } from 'next';
import { NextIntlClientProvider, useMessages } from 'next-intl';
import { unstable_setRequestLocale } from 'next-intl/server';

import { AllLocales } from '@/utils/AppConfig';

// -----------------------------------------------------------
// Base metadata — applies to all pages unless overridden.
// Page-level exports of `metadata` or `generateMetadata` will
// be deep-merged with this by Next.js automatically.
// -----------------------------------------------------------
export const metadata: Metadata = {
  title: {
    default: 'NativPost',
    // Used by child pages: "Dashboard | NativPost"
    template: '%s | NativPost',
  },
  description:
    'Studio-quality social content for your brand. AI-powered content generation, scheduling, and publishing — built for agencies and growing businesses.',
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || 'https://app.nativpost.com',
  ),
  openGraph: {
    siteName: 'NativPost',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    site: '@nativpost',
    creator: '@nativpost',
  },
  // Default robots — individual pages override this
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  icons: [
    {
      rel: 'apple-touch-icon',
      url: '/apple-touch-icon.png',
    },
    {
      rel: 'icon',
      type: 'image/png',
      sizes: '32x32',
      url: '/favicon-32x32.png',
    },
    {
      rel: 'icon',
      type: 'image/png',
      sizes: '16x16',
      url: '/favicon-16x16.png',
    },
    {
      rel: 'icon',
      url: '/favicon.ico',
    },
  ],
};

export function generateStaticParams() {
  return AllLocales.map(locale => ({ locale }));
}

export default function RootLayout(props: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  unstable_setRequestLocale(props.params.locale);

  const messages = useMessages();

  return (
    <html lang={props.params.locale} suppressHydrationWarning>
      <head>
        {/* Apply theme before first paint to prevent flash */}
        <script
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var c=document.cookie.split('; ').find(function(r){return r.startsWith('np-theme=')});var t=c?c.split('=')[1]:'system';if(t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})()`,
          }}
        />
      </head>
      <body className="bg-background text-foreground antialiased" suppressHydrationWarning>
        <NextIntlClientProvider
          locale={props.params.locale}
          messages={messages}
        >
          {props.children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
