'use client';

import { useOrganization } from '@clerk/nextjs';
import { useEffect, useRef } from 'react';

export function useOrgSync() {
  const { organization } = useOrganization();
  const prevOrgId = useRef<string | undefined>(undefined);

  useEffect(() => {
    const currentId = organization?.id;

    if (prevOrgId.current === undefined) {
      prevOrgId.current = currentId;
      return;
    }

    if (prevOrgId.current !== currentId) {
      prevOrgId.current = currentId;
      window.location.reload(); // hard reload — forces server re-auth with new orgId
    }
  }, [organization?.id]);
}