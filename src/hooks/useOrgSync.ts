'use client';

import { useOrganization } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

export function useOrgSync() {
  const { organization } = useOrganization();
  const router = useRouter();
  const prevOrgId = useRef<string | undefined>(undefined);

  useEffect(() => {
    const currentId = organization?.id;

    // Skip the very first mount — no "switch" happened yet
    if (prevOrgId.current === undefined) {
      prevOrgId.current = currentId;
      return;
    }

    // Org actually changed → refresh so the server layout re-runs
    if (prevOrgId.current !== currentId) {
      prevOrgId.current = currentId;
      router.refresh();
    }
  }, [organization?.id, router]);
}