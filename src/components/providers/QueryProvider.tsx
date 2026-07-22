'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

/**
 * Server-state layer for the dashboard.
 *
 * Why: pages previously re-fetched everything on every mount (useEffect +
 * fetch), so each navigation started from a spinner. With a shared cache,
 * revisiting a page paints the last known data instantly and revalidates in
 * the background — the "instant navigation" feel of Linear/Vercel.
 *
 * Defaults:
 * - staleTime 30s: dashboard data tolerates short staleness; avoids refetch
 *   storms when hopping between pages.
 * - retry 1: fail fast — every consumer renders a real error state with Retry.
 * - refetchOnWindowFocus: keeps long-lived tabs honest without polling.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() =>
    new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 30_000,
          retry: 1,
          refetchOnWindowFocus: true,
        },
      },
    }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
