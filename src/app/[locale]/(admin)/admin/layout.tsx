/**
 * src/app/[locale]/(admin)/admin/layout.tsx
 *
 * Admin layout — client component, matches the pattern of (auth)/layout.tsx.
 *
 * Must wrap with ClerkProvider so Clerk components (UserButton, useAuth)
 * work inside AdminShell. The (admin) route group does not inherit the
 * ClerkProvider from (auth)/layout.tsx — each route group needs its own.
 *
 * Auth gate (isNativPostStaff) is enforced in middleware.ts.
 * This layout trusts the middleware and renders directly.
 * A server-side double-check is not possible here because this is a
 * client component — and a separate server layout would cause the same
 * locale crash. The middleware is the security gate.
 */

'use client';

import { enUS } from '@clerk/localizations';
import { ClerkProvider } from '@clerk/nextjs';

import { AppConfig } from '@/utils/AppConfig';
import AdminShell from './AdminShell';

export default function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const isDefault = params.locale === AppConfig.defaultLocale;

  return (
    <ClerkProvider
      localization={enUS}
      signInUrl={isDefault ? '/sign-in' : `/${params.locale}/sign-in`}
      afterSignOutUrl={isDefault ? '/' : `/${params.locale}/`}
      appearance={{
        variables: {
          colorPrimary: '#864FFE',
          colorText: '#1A1A1C',
          colorTextSecondary: '#6B7280',
          colorBackground: '#FFFFFF',
          colorInputBackground: '#F9FAFB',
          colorInputText: '#1A1A1C',
          fontFamily: '"Inter Tight", system-ui, -apple-system, sans-serif',
          borderRadius: '0.75rem',
        },
      }}
    >
      <AdminShell>{children}</AdminShell>
    </ClerkProvider>
  );
}