'use client';

import { enUS, frFR } from '@clerk/localizations';
import { ClerkProvider } from '@clerk/nextjs';

import { AppConfig } from '@/utils/AppConfig';

export default function AuthLayout(props: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  let clerkLocale = enUS;
  let signInUrl = '/sign-in';
  let signUpUrl = '/sign-up';
  let dashboardUrl = '/dashboard';
  let afterSignOutUrl = '/';

  if (props.params.locale === 'fr') {
    clerkLocale = frFR;
  }

  if (props.params.locale !== AppConfig.defaultLocale) {
    signInUrl = `/${props.params.locale}${signInUrl}`;
    signUpUrl = `/${props.params.locale}${signUpUrl}`;
    dashboardUrl = `/${props.params.locale}${dashboardUrl}`;
    afterSignOutUrl = `/${props.params.locale}${afterSignOutUrl}`;
  }

  return (
    <ClerkProvider
      localization={clerkLocale}
      signInUrl={signInUrl}
      signUpUrl={signUpUrl}
      signInFallbackRedirectUrl={dashboardUrl}
      signUpFallbackRedirectUrl={dashboardUrl}
      afterSignOutUrl={afterSignOutUrl}
      appearance={{
        variables: {
          colorPrimary: '#16A34A',
          colorText: '#1A1A1C',
          colorTextSecondary: '#6B7280',
          colorBackground: '#FFFFFF',
          colorInputBackground: '#F9FAFB',
          colorInputText: '#1A1A1C',
          fontFamily: '"Inter Tight", system-ui, -apple-system, sans-serif',
          borderRadius: '0.75rem',
        },
        elements: {
          // Card
          card: 'shadow-lg border rounded-2xl',
          // Buttons
          formButtonPrimary:
            'bg-[#16A34A] hover:bg-[#15803d] rounded-full text-sm font-medium shadow-sm',
          // Social buttons
          socialButtonsBlockButton:
            'border rounded-full hover:bg-gray-50 text-sm',
          socialButtonsBlockButtonText: 'font-medium',
          // Form fields
          formFieldInput:
            'rounded-xl border-gray-200 focus:border-[#16A34A] focus:ring-[#16A34A]/20 text-sm',
          formFieldLabel: 'text-sm font-medium text-gray-700',
          // Links
          footerActionLink: 'text-[#16A34A] hover:text-[#15803d] font-medium',
          // Header
          headerTitle: 'text-xl font-semibold',
          headerSubtitle: 'text-sm text-gray-500',
          // Logo / branding
          logoBox: 'h-8',
          // Organization switcher
          organizationSwitcherTrigger:
            'rounded-lg border px-3 py-2 text-sm hover:bg-gray-50',
        },
        layout: {
          socialButtonsPlacement: 'bottom',
          socialButtonsVariant: 'blockButton',
        },
      }}
    >
      {props.children}
    </ClerkProvider>
  );
}
