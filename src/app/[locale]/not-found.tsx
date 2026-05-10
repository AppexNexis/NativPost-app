/**
 * src/app/not-found.tsx
 *
 * Rendered by Next.js for any route that does not match a page file.
 * This replaces the default Next.js 404 page across the entire app.
 */

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6">
      <div className="w-full max-w-md text-center">
        <p className="text-8xl font-bold tracking-tight text-muted-foreground/20">404</p>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you are looking for does not exist or has been moved.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go to dashboard
          </Link>
          <Link
            href="/dashboard/support"
            className="rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            Contact support
          </Link>
        </div>
      </div>
    </div>
  );
}
