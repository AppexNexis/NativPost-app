'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

// import type { BillingStatus } from '@/lib/billing'; // adjust import as needed

export function BillingGate({ billing }: { billing: { planStatus: string; setupFeePaid: boolean } | null }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!billing) return;

    const isPastDueOrCancelled =
      billing.planStatus === 'past_due' || billing.planStatus === 'cancelled';
    const isOnBilling = pathname.includes('/billing');

    if (isPastDueOrCancelled && billing.setupFeePaid && !isOnBilling) {
      router.replace('/dashboard/billing?recovery=true');
    }
  }, [billing, pathname, router]);

  return null;
}