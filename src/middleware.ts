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
]);

const isApiRoute = createRouteMatcher(['/api(.*)']);

// Routes exempt from subscription check (always accessible when authenticated)
const isSubscriptionExemptRoute = createRouteMatcher([
  '/subscribe(.*)',
  '/:locale/subscribe(.*)',
  '/onboarding(.*)',
  '/:locale/onboarding(.*)',
  '/dashboard/billing(.*)',
  '/:locale/dashboard/billing(.*)',
]);

export default function middleware(
  request: NextRequest,
  event: NextFetchEvent,
) {
  // API routes: protect with Clerk but skip intl middleware
  if (isApiRoute(request)) {
    return clerkMiddleware(async (auth, req) => {
      // Public API routes — no auth needed
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

  // Dashboard & auth pages
  if (
    request.nextUrl.pathname.includes('/sign-in')
    || request.nextUrl.pathname.includes('/sign-up')
    || isProtectedRoute(request)
  ) {
    return clerkMiddleware(async (auth, req) => {
      if (isProtectedRoute(req)) {
        const locale = req.nextUrl.pathname.match(/(\/.*)\/dashboard/)?.at(1) ?? '';
        const signInUrl = new URL(`${locale}/sign-in`, req.url);
        await auth.protect({ unauthenticatedUrl: signInUrl.toString() });
      }

      const authObj = await auth();

      // Redirect to org selection if no org selected
      if (
        authObj.userId
        && !authObj.orgId
        && req.nextUrl.pathname.includes('/dashboard')
        && !req.nextUrl.pathname.endsWith('/organization-selection')
      ) {
        return NextResponse.redirect(
          new URL('/onboarding/organization-selection', req.url),
        );
      }

      // ── Subscription enforcement ─────────────────────────
      // After org is selected, check if they have an active subscription.
      // Exempt: /subscribe, /onboarding, /dashboard/billing
      if (
        authObj.userId
        && authObj.orgId
        && req.nextUrl.pathname.includes('/dashboard')
        && !isSubscriptionExemptRoute(req)
      ) {
        try {
          // Fetch billing status from DB via internal API
          // We use a lightweight direct check here to avoid circular imports
          const billingUrl = new URL('/api/billing/status', req.url);
          const billingRes = await fetch(billingUrl.toString(), {
            headers: {
              // Forward the cookie so Clerk auth works in the API route
              cookie: req.headers.get('cookie') ?? '',
            },
          });

          if (billingRes.ok) {
            const billing = await billingRes.json();
            const isActive = billing.isActive;
            const trialExpired = billing.trialExpired;

            // Redirect to subscribe page if no active subscription
            if (!isActive || trialExpired) {
              const locale = req.nextUrl.pathname.match(/^(\/[a-z]{2})\//)?.[1] ?? '';
              const subscribeUrl = new URL(`${locale}/subscribe`, req.url);
              // Preserve the original destination so we can redirect back after subscribing
              subscribeUrl.searchParams.set('redirect', req.nextUrl.pathname);
              return NextResponse.redirect(subscribeUrl);
            }
          }
        } catch (err) {
          // If billing check fails, allow through — don't block users on infra errors
          console.error('[Middleware] Billing check failed:', err);
        }
      }

      return intlMiddleware(req);
    })(request, event);
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ['/((?!.+\\.[\\w]+$|_next|monitoring).*)', '/', '/(api|trpc)(.*)'],
};
