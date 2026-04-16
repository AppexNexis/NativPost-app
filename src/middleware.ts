import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import type { NextFetchEvent, NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import createMiddleware from 'next-intl/middleware';

import { AllLocales, AppConfig } from './utils/AppConfig';

const intlMiddleware = createMiddleware({
  locales: AllLocales,
  localePrefix: AppConfig.localePrefix,
  defaultLocale: AppConfig.defaultLocale,
});

const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/:locale/dashboard(.*)',
  '/onboarding(.*)',
  '/:locale/onboarding(.*)',
  '/subscribe(.*)',
  '/:locale/subscribe(.*)',
]);

const isDashboardRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/:locale/dashboard(.*)',
]);

const isApiRoute = createRouteMatcher(['/api(.*)']);

export default function middleware(request: NextRequest, event: NextFetchEvent) {
  // ── API routes ────────────────────────────────────────────
  if (isApiRoute(request)) {
    return clerkMiddleware(async (auth, req) => {
      // Public endpoints — no auth required
      if (
        req.nextUrl.pathname.startsWith('/api/billing/stripe-webhook')
        || req.nextUrl.pathname.startsWith('/api/billing/paystack-webhook')
        || req.nextUrl.pathname.startsWith('/api/cron/')
      ) {
        return NextResponse.next();
      }

      const authObj = await auth();
      if (!authObj.userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      return NextResponse.next();
    })(request, event);
  }

  // ── Page routes ───────────────────────────────────────────
  if (
    request.nextUrl.pathname.includes('/sign-in')
    || request.nextUrl.pathname.includes('/sign-up')
    || isProtectedRoute(request)
  ) {
    return clerkMiddleware(async (auth, req) => {
      // Enforce Clerk auth on protected routes
      if (isProtectedRoute(req)) {
        const localeMatch = req.nextUrl.pathname.match(/^(\/[a-z]{2})\//);
        const locale = localeMatch?.[1] ?? '';
        const signInUrl = new URL(`${locale}/sign-in`, req.url);
        await auth.protect({ unauthenticatedUrl: signInUrl.toString() });
      }

      const authObj = await auth();

      // Dashboard only: no org → org selection
      // /subscribe is deliberately excluded so users coming straight
      // from sign-up (before org creation) don't get stuck in a loop
      if (
        authObj.userId
        && !authObj.orgId
        && isDashboardRoute(req)
        && !req.nextUrl.pathname.endsWith('/organization-selection')
      ) {
        return NextResponse.redirect(
          new URL('/onboarding/organization-selection', req.url),
        );
      }

      // ── NO BILLING CHECK HERE ─────────────────────────────
      // Billing enforcement is handled entirely by the dashboard
      // layout server component (DashboardLayoutGate) which does
      // a direct DB call via getOrgBillingState(). This is more
      // reliable than fetch() from Edge middleware because:
      //   1. No cookie forwarding issues
      //   2. No Edge runtime DB connection limitations
      //   3. Errors are caught gracefully without blocking users
      //
      // Clerk's signInFallbackRedirectUrl / signUpFallbackRedirectUrl
      // both point to /subscribe so new users always hit the paywall.

      return intlMiddleware(req);
    })(request, event);
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ['/((?!.+\\.[\\w]+$|_next|monitoring).*)', '/', '/(api|trpc)(.*)'],
};