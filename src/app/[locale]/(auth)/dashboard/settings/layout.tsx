import type { Metadata } from 'next';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Settings',
};

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return <NuqsAdapter>{children}</NuqsAdapter>;
}
