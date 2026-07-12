'use client';

import { Loader2 } from 'lucide-react';
import { useState } from 'react';

import { useOrgCredits } from '@/features/credits/useOrgCredits';

import { AutoTopUpCard } from './AutoTopUpCard';
import { BalanceGrid } from './BalanceGrid';
import { BuyCreditsCard } from './BuyCreditsCard';
import { ConfirmPurchaseDialog } from './ConfirmPurchaseDialog';
import { CreditActivityTable } from './CreditActivityTable';

export function CreditsPanel() {
  const { wallet, loading, error, refetch } = useOrgCredits();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogAmount, setDialogAmount] = useState<number>(10);

  const openBuy = (amountUsd: number) => {
    setDialogAmount(amountUsd);
    setDialogOpen(true);
  };

  if (loading && !wallet) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && !wallet) {
    return (
      <div className="rounded-lg border border-red-500/40 bg-red-500/5 p-4 text-sm text-red-500">
        {error}
      </div>
    );
  }

  if (!wallet) return null;

  return (
    <div className="flex flex-col gap-6 py-2">
      <BalanceGrid wallet={wallet} onConfigChanged={refetch} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BuyCreditsCard onBuy={openBuy} />
        <AutoTopUpCard wallet={wallet} onSaved={refetch} />
      </div>

      <CreditActivityTable activity={wallet.recentActivity} />

      <ConfirmPurchaseDialog
        open={dialogOpen}
        amountUsd={dialogAmount}
        onOpenChange={setDialogOpen}
        onPurchased={refetch}
      />
    </div>
  );
}
