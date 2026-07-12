/**
 * src/middleware.ts
 *
 * Admin access model:
 *
 * Clerk makes the creator of any org org:admin by default. This means every
 * NativPost client who creates their own organization is org:admin inside that
 * org — so checking orgRole === 'org:admin' would grant clients access to the
 * admin panel.
 *
 * The correct check is: is the user's active org the NativPost internal org?
 * Clients are structurally never members of the internal org, making this
 * airtight at the data model level.
 *
 * Required env var: NATIVPOST_TEAM_ORG_ID
 * Set this to the Clerk org ID of your internal NativPost team organization.
 * Find it in: Clerk Dashboard → Organizations → your internal org → copy the ID.
 */

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
  '/admin(.*)',
  '/:locale/admin(.*)',
]);

const isDashboardRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/:locale/dashboard(.*)',
]);

const isOnboardingSetupRoute = createRouteMatcher([
  '/onboarding/setup',
  '/:locale/onboarding/setup',
]);

const isAdminRoute = createRouteMatcher([
  '/admin(.*)',
  '/:locale/admin(.*)',
]);

const isApiRoute = createRouteMatcher(['/api(.*)']);
const isAdminApiRoute = createRouteMatcher(['/api/admin(.*)']);

/**
 * Returns true only for NativPost staff members.
 *
 * A staff member must have the NativPost internal org active (orgId matches)
 * AND hold the admin role inside it. Both conditions are required.
 *
 * Clients are org:admin inside their own orgs but can never be members of
 * the NativPost internal org, so they will always fail the orgId check.
 */
function isNativPostStaff(
  orgId: string | null | undefined,
  orgRole: string | null | undefined,
): boolean {
  const teamOrgId = process.env.NATIVPOST_TEAM_ORG_ID;
  if (!teamOrgId) {
    console.warn('[middleware] NATIVPOST_TEAM_ORG_ID is not set. Admin access is disabled.');
    return false;
  }
  return orgId === teamOrgId && orgRole === 'org:admin';
}

export default function middleware(request: NextRequest, event: NextFetchEvent) {
  // API ROUTES
  if (isApiRoute(request)) {
    return clerkMiddleware(async (auth, req) => {
      if (
        req.nextUrl.pathname.startsWith('/api/billing/stripe-webhook')
        || req.nextUrl.pathname.startsWith('/api/billing/paystack-webhook')
        || req.nextUrl.pathname.startsWith('/api/cron/')
        || req.nextUrl.pathname.startsWith('/api/ai-studio/webhook/')
      ) {
        return NextResponse.next();
      }

      const authObj = await auth();

      if (!authObj.userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      if (isAdminApiRoute(req)) {
        if (!isNativPostStaff(authObj.orgId, authObj.orgRole)) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
      }

      return NextResponse.next();
    })(request, event);
  }

  // PAGE ROUTES
  return clerkMiddleware(async (auth, req) => {
    const authObj = await auth();
    const localeMatch = req.nextUrl.pathname.match(/^(\/[a-z]{2})\//);
    const locale = localeMatch?.[1] ?? '';

    if (isProtectedRoute(req)) {
      await auth.protect({
        unauthenticatedUrl: new URL(`${locale}/sign-in`, req.url).toString(),
      });
    }

    if (isAdminRoute(req)) {
      if (!isNativPostStaff(authObj.orgId, authObj.orgRole)) {
        return NextResponse.redirect(new URL('/dashboard', req.url));
      }
      return intlMiddleware(req);
    }

    if (authObj.userId && !authObj.orgId && isDashboardRoute(req)) {
      return NextResponse.redirect(
        new URL('/onboarding/organization-selection', req.url),
      );
    }

    // Onboarding completion gate: block dashboard access until the current
    // org has been marked onboarded. Reads Clerk sessionClaims.publicMetadata
    // (zero DB call). Pre-existing users without the metadata flag fall back
    // to a signed cookie (np_onb_<orgId>=1) set on complete or by first-hit
    // backfill; if neither exists the middleware sends them to /onboarding/setup
    // where the wizard's draft check + finish flow will backfill both signals.
    if (authObj.userId && authObj.orgId && isDashboardRoute(req)) {
      const claims = authObj.sessionClaims as any;
      const onboardedOrgs = claims?.publicMetadata?.onboardedOrgs;
      const orgIsOnboarded = !!(onboardedOrgs && onboardedOrgs[authObj.orgId]);
      const cookieOk = req.cookies.get(`np_onb_${authObj.orgId}`)?.value === '1';
      if (!orgIsOnboarded && !cookieOk) {
        return NextResponse.redirect(
          new URL('/onboarding/setup', req.url),
        );
      }
    }

    // Inverse gate: if the active org is already onboarded, bounce direct
    // hits on /onboarding/setup straight to the dashboard so returning users
    // cannot re-enter the wizard by typing the URL.
    if (authObj.userId && authObj.orgId && isOnboardingSetupRoute(req)) {
      const claims = authObj.sessionClaims as any;
      const onboardedOrgs = claims?.publicMetadata?.onboardedOrgs;
      const orgIsOnboarded = !!(onboardedOrgs && onboardedOrgs[authObj.orgId]);
      const cookieOk = req.cookies.get(`np_onb_${authObj.orgId}`)?.value === '1';
      if (orgIsOnboarded || cookieOk) {
        return NextResponse.redirect(new URL('/dashboard', req.url));
      }
    }

    return intlMiddleware(req);
  })(request, event);
}

export const config = {
  matcher: ['/((?!.*\\.[\\w]+$|_next|monitoring).*)', '/', '/(api|trpc)(.*)'],
};
