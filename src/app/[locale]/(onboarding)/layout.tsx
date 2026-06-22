'use client';

import { enUS } from '@clerk/localizations';
import { ClerkProvider } from '@clerk/nextjs';

import { AppConfig } from '@/utils/AppConfig';

export default function OnboardingLayout({
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
      <main className="min-h-screen w-full bg-white">
        {children}
      </main>
    </ClerkProvider>
  );
}