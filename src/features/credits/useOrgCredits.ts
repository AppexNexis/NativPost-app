'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { AiCreditWallet } from '@/lib/ai-studio/server';

interface UseOrgCreditsResult {
  wallet: AiCreditWallet | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const REFRESH_INTERVAL_MS = 30_000;

/**
 * Fetches the current org's AI credit wallet from /api/ai-studio/credits.
 *
 * Auto-refreshes every 30s. Callers can trigger an immediate refetch after
 * a purchase or config change via the returned refetch function.
 */
export function useOrgCredits(options?: { autoRefresh?: boolean }): UseOrgCreditsResult {
  const autoRefresh = options?.autoRefresh ?? true;
  const [wallet, setWallet] = useState<AiCreditWallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const fetchWallet = useCallback(async () => {
    try {
      const res = await fetch('/api/ai-studio/credits', { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`Failed to fetch credits (${res.status})`);
      }
      const data = await res.json();
      if (mounted.current) {
        setWallet(data.wallet ?? null);
        setError(null);
      }
    } catch (err: any) {
      if (mounted.current) {
        setError(err?.message || 'Failed to fetch credits');
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    fetchWallet();
    if (!autoRefresh) {
      return () => {
        mounted.current = false;
      };
    }
    const interval = setInterval(fetchWallet, REFRESH_INTERVAL_MS);
    return () => {
      mounted.current = false;
      clearInterval(interval);
    };
  }, [fetchWallet, autoRefresh]);

  return { wallet, loading, error, refetch: fetchWallet };
}
