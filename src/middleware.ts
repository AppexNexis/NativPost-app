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

// routes that should NOT trigger billing redirect loop
// const isSubscriptionExemptRoute = createRouteMatcher([
//   '/subscribe(.*)',
//   '/:locale/subscribe(.*)',
//   '/onboarding(.*)',
//   '/:locale/onboarding(.*)',
//   '/dashboard/billing(.*)',
//   '/:locale/dashboard/billing(.*)',
//   '/api/billing(.*)', // IMPORTANT: prevent recursion issues
// ]);

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
  return clerkMiddleware(async (auth, req) => {
    const authObj = await auth();

    const localeMatch = req.nextUrl.pathname.match(/^(\/[a-z]{2})\//);
    const locale = localeMatch?.[1] ?? '';

    // 1. AUTH GUARD
    if (isProtectedRoute(req)) {
      await auth.protect({
        unauthenticatedUrl: new URL(`${locale}/sign-in`, req.url).toString(),
      });
    }

    // 2. ORG GUARD
    if (
      authObj.userId
      && !authObj.orgId
      && isDashboardRoute(req)
    ) {
      return NextResponse.redirect(
        new URL('/onboarding/organization-selection', req.url),
      );
    }

    // 3. 🔥 STRONG BILLING ENFORCEMENT (CORE FIX)
    // if (
    //   authObj.userId
    //   && authObj.orgId
    //   && req.nextUrl.pathname.startsWith('/dashboard')
    //   && !isSubscriptionExemptRoute(req)
    // ) {
    //   try {
    //     const billingRes = await fetch(
    //       new URL('/api/billing/status', req.url),
    //       {
    //         headers: {
    //           cookie: req.headers.get('cookie') ?? '',
    //         },
    //       },
    //     );

    //     if (billingRes.ok) {
    //       const billing = await billingRes.json();

    //       const isActive = billing?.isActive;
    //       const trialExpired = billing?.trialExpired;

    //       // 🚨 HARD BLOCK
    //       if (!isActive || trialExpired) {
    //         const redirectUrl = new URL(`${locale}/subscribe`, req.url);

    //         redirectUrl.searchParams.set(
    //           'redirect',
    //           req.nextUrl.pathname,
    //         );

    //         return NextResponse.redirect(redirectUrl);
    //       }
    //     }
    //   } catch (err) {
    //     // fail open (never break app)
    //     console.error('[Middleware] Billing check failed:', err);
    //   }
    // }

    return intlMiddleware(req);
  })(request, event);
}

export const config = {
  matcher: ['/((?!.*\\.[\\w]+$|_next|monitoring).*)', '/', '/(api|trpc)(.*)'],
};
