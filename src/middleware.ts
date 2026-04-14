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

// Routes that NEVER require billing check
const isSubscriptionExemptRoute = createRouteMatcher([
  '/subscribe(.*)',
  '/:locale/subscribe(.*)',
  '/onboarding(.*)',
  '/:locale/onboarding(.*)',
  '/dashboard/billing(.*)',
  '/:locale/dashboard/billing(.*)',
]);

export default function middleware(request: NextRequest, event: NextFetchEvent) {
  // ───────────────────────── API ROUTES ─────────────────────────
  if (isApiRoute(request)) {
    return clerkMiddleware(async (auth, req) => {
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

  // ───────────────────────── PAGE ROUTES ─────────────────────────
  if (
    request.nextUrl.pathname.includes('/sign-in')
    || request.nextUrl.pathname.includes('/sign-up')
    || isProtectedRoute(request)
  ) {
    return clerkMiddleware(async (auth, req) => {
      // Require auth for protected routes
      if (isProtectedRoute(req)) {
        const localeMatch = req.nextUrl.pathname.match(/^(\/[a-z]{2})\//);
        const locale = localeMatch?.[1] ?? '';
        const signInUrl = new URL(`${locale}/sign-in`, req.url);

        await auth.protect({
          unauthenticatedUrl: signInUrl.toString(),
        });
      }

      const authObj = await auth();

      // ───────── ORG CHECK ─────────
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

      // ───────── BILLING CHECK (RESTORED HERE - IMPORTANT) ─────────
      if (
        authObj.userId
        && authObj.orgId
        && isDashboardRoute(req)
        && !isSubscriptionExemptRoute(req)
      ) {
        try {
          const billingUrl = new URL('/api/billing/status', req.url);

          const billingRes = await fetch(billingUrl.toString(), {
            headers: {
              cookie: req.headers.get('cookie') ?? '',
            },
          });

          if (billingRes.ok) {
            const billing = await billingRes.json();

            const isActive = billing?.isActive;
            const trialExpired = billing?.trialExpired;

            if (!isActive || trialExpired) {
              const locale
                = req.nextUrl.pathname.match(/^(\/[a-z]{2})\//)?.[1] ?? '';

              const redirectUrl = new URL(`${locale}/subscribe`, req.url);

              redirectUrl.searchParams.set(
                'redirect',
                req.nextUrl.pathname,
              );

              return NextResponse.redirect(redirectUrl);
            }
          }
        } catch (err) {
          console.error('[Middleware] Billing check failed:', err);
          // IMPORTANT: fail open so app never 500s
        }
      }

      return intlMiddleware(req);
    })(request, event);
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ['/((?!.*\\.[\\w]+$|_next|monitoring).*)', '/', '/(api|trpc)(.*)'],
};
