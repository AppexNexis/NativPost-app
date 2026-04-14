import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import {
  type NextFetchEvent,
  type NextRequest,
  NextResponse,
} from 'next/server';
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

export default function middleware(
  request: NextRequest,
  event: NextFetchEvent,
) {
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

  // ── Protected pages ───────────────────────────────────────
  if (
    request.nextUrl.pathname.includes('/sign-in')
    || request.nextUrl.pathname.includes('/sign-up')
    || isProtectedRoute(request)
  ) {
    return clerkMiddleware(async (auth, req) => {
      // Enforce Clerk auth on all protected routes
      // if (isProtectedRoute(req)) {
      //   // For dashboard routes, extract locale for sign-in redirect
      //   const locale
      //     = req.nextUrl.pathname.match(/(\/.*)\/dashboard/)?.at(1) ?? '';
      //   const signInUrl = new URL(`${locale}/sign-in`, req.url);
      //   await auth.protect({ unauthenticatedUrl: signInUrl.toString() });
      // }

      if (isProtectedRoute(req)) {
        const localeMatch
          = req.nextUrl.pathname.match(/^(\/[a-z]{2})\//);
        const locale = localeMatch?.[1] ?? '';
        const signInUrl = new URL(`${locale}/sign-in`, req.url);
        await auth.protect({ unauthenticatedUrl: signInUrl.toString() });
      }

      const authObj = await auth();

      // Dashboard only: if no org selected → redirect to org selection
      // Subscribe page is exempt from this check — user may not have
      // an org yet if they're coming straight from sign-up
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

      return intlMiddleware(req);
    })(request, event);
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ['/((?!.+\\.[\\w]+$|_next|monitoring).*)', '/', '/(api|trpc)(.*)'],
};
