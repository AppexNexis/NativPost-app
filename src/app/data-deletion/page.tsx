/**
 * /data-deletion
 *
 * Public page — lives OUTSIDE the dashboard layout and the [locale] group.
 * No auth required. Meta redirects users here after a data deletion request.
 *
 * File location: app/data-deletion/page.tsx
 * (NOT inside app/[locale]/(auth)/ — middleware would force Clerk sign-in)
 */

import { type Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import mainLogo from '/public/assets/images/shared/main-logo.svg';

export const metadata: Metadata = {
  title: 'Data Deletion | NativPost',
  description: 'Confirmation of your data deletion request.',
  robots: 'noindex, nofollow',
};

export default async function DataDeletionPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      {/* Minimal header — matches dashboard header height */}
      <header className="flex h-14 items-center border-b bg-background px-6">
        <Link href="https://nativpost.com" className="inline-flex items-center">
          <figure className="max-w-[130px]">
            <Image
              src={mainLogo}
              alt="NativPost"
              className="h-auto w-full dark:invert"
              priority
            />
          </figure>
        </Link>
      </header>

      {/* Content */}
      <main className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
            {/* Green top bar — visual accent */}
            <div className="h-1.5 w-full bg-emerald-500" />

            <div className="p-8 text-center">
              {/* Checkmark icon */}
              <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="size-7 text-emerald-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>

              <h1 className="mb-2 text-xl font-semibold tracking-tight">
                Data Deletion Confirmed
              </h1>

              <p className="mb-6 text-sm text-muted-foreground">
                Your request has been processed. All personal data associated
                with your Facebook or Instagram account has been permanently
                removed from NativPost's systems.
              </p>

              {/* Confirmation code */}
              {code && (
                <div className="mb-6 rounded-lg border bg-muted/50 px-4 py-3 text-left">
                  <p className="mb-1 text-xs text-muted-foreground">
                    Confirmation code
                  </p>
                  <p className="font-mono text-sm font-medium tracking-wide break-all">
                    {code}
                  </p>
                </div>
              )}

              {/* What was deleted */}
              <div className="mb-6 rounded-lg border bg-muted/30 px-4 py-4 text-left">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  What was deleted
                </p>
                <ul className="space-y-1.5">
                  {[
                    'Connected account credentials',
                    'Access tokens and refresh tokens',
                    'Profile information (username, profile picture)',
                  ].map(item => (
                    <li key={item} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="mt-0.5 size-3.5 shrink-0 text-emerald-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <p className="text-xs text-muted-foreground">
                Questions? Contact us at{' '}
                <a
                  href="mailto:info@nativpost.com"
                  className="font-medium text-foreground underline underline-offset-2 hover:opacity-70"
                >
                  info@nativpost.com
                </a>
              </p>
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            NativPost uses OAuth 2.0 and follows Meta's Platform Terms & Developer Policies.
          </p>
        </div>
      </main>
    </div>
  );
}
