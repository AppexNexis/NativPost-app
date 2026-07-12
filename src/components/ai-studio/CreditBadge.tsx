'use client';

import { Coins, Timer } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { AiCreditWallet } from '@/lib/ai-studio/server';

interface CreditBadgeProps {
  wallet?: AiCreditWallet | null;
  onWallet?: (wallet: AiCreditWallet) => void;
}

export function CreditBadge({ wallet: walletProp, onWallet }: CreditBadgeProps) {
  const [wallet, setWallet] = useState<AiCreditWallet | null>(walletProp ?? null);

  useEffect(() => {
    if (walletProp) {
      setWallet(walletProp);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/ai-studio/credits', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setWallet(data.wallet);
          onWallet?.(data.wallet);
        }
      } catch {
        // ignore
      }
    };
    load();
    const t = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [walletProp, onWallet]);

  const monthlyRemaining = wallet
    ? Math.max(0, wallet.monthly.limit - wallet.monthly.used)
    : 0;
  const addonRemaining = wallet?.addon.remaining ?? 0;
  const reserved = wallet?.reservedCredits ?? 0;
  const credits = Math.max(0, monthlyRemaining + addonRemaining - reserved);

  return (
    <div className="inline-flex items-center gap-2">
      <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-foreground">
        <Coins className="h-3.5 w-3.5" />
        <span>{credits.toLocaleString()} credits</span>
      </div>
      {reserved > 0 && (
        <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          <Timer className="h-3 w-3" />
          <span>{reserved.toLocaleString()} reserved</span>
        </div>
      )}
    </div>
  );
}
