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
  let afterSignOutUrl = '/';

  // After sign-in/up, always go to /subscribe first.
  // The subscribe page will check billing status and either:
  //   (a) redirect to /dashboard if already subscribed/trialing, or
  //   (b) show the paywall so user can start their trial.
  let postAuthUrl = '/subscribe';

  if (props.params.locale === 'fr') {
    clerkLocale = frFR;
  }

  if (props.params.locale !== AppConfig.defaultLocale) {
    signInUrl = `/${props.params.locale}${signInUrl}`;
    signUpUrl = `/${props.params.locale}${signUpUrl}`;
    postAuthUrl = `/${props.params.locale}${postAuthUrl}`;
    afterSignOutUrl = `/${props.params.locale}${afterSignOutUrl}`;
  }

  return (
    <ClerkProvider
      localization={clerkLocale}
      signInUrl={signInUrl}
      signUpUrl={signUpUrl}
      signInFallbackRedirectUrl={postAuthUrl}
      signUpFallbackRedirectUrl={postAuthUrl}
      afterSignOutUrl={afterSignOutUrl}
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
        elements: {
          card: 'shadow-lg border rounded-2xl',
          formButtonPrimary:
            'bg-[#864FFE] hover:bg-[#7C31F6] rounded-full text-sm font-medium shadow-sm',
          socialButtonsBlockButton:
            'border rounded-full hover:bg-gray-50 text-sm',
          socialButtonsBlockButtonText: 'font-medium',
          formFieldInput:
            'rounded-xl border-gray-200 focus:border-[#864FFE] focus:ring-[#864FFE]/20 text-sm',
          formFieldLabel: 'text-sm font-medium text-gray-700',
          footerActionLink: 'text-[#864FFE] hover:text-[#7C31F6] font-medium',
          headerTitle: 'text-xl font-semibold',
          headerSubtitle: 'text-sm text-gray-500',
          logoBox: 'h-8',
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
