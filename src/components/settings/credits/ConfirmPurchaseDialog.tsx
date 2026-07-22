'use client';

import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const CREDITS_PER_DOLLAR = 10;

type Props = {
  open: boolean;
  amountUsd: number;
  onOpenChange: (open: boolean) => void;
  onPurchased: () => Promise<void>;
};

type Phase = 'idle' | 'charging' | 'success' | 'error';

export function ConfirmPurchaseDialog({ open, amountUsd, onOpenChange, onPurchased }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState<string>('');
  const [creditsAdded, setCreditsAdded] = useState<number>(0);

  useEffect(() => {
    if (!open) {
      setPhase('idle');
      setMessage('');
      setCreditsAdded(0);
    }
  }, [open]);

  const credits = Math.round(amountUsd * CREDITS_PER_DOLLAR);

  const purchase = async () => {
    setPhase('charging');
    setMessage('');
    try {
      const res = await fetch('/api/credits/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountUsd }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPhase('error');
        setMessage(data.error || 'Payment failed. Please try again.');
        return;
      }
      if (data.mode === 'checkout' && data.url) {
        window.location.href = data.url;
        return;
      }
      setPhase('success');
      setCreditsAdded(data.creditsAdded ?? credits);
      setMessage(`Added ${(data.creditsAdded ?? credits).toLocaleString()} credits to your balance.`);
      await onPurchased();
    } catch (err: any) {
      setPhase('error');
      setMessage(err?.message || 'Payment failed. Please try again.');
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (phase === 'charging') {
          return;
        }
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirm Credit Purchase</DialogTitle>
          <DialogDescription>
            Your saved payment method will be charged. Credits arrive instantly.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 rounded-lg border bg-muted/40 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Credits</span>
            <span className="font-semibold tabular-nums">
              {credits.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className="text-heading tabular-nums">
              $
              {amountUsd.toFixed(2)}
            </span>
          </div>
        </div>

        {phase === 'error' && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/5 p-3 text-sm text-red-500">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <p>{message}</p>
          </div>
        )}

        {phase === 'success' && (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3 text-sm text-emerald-500">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            <p>{message}</p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {phase === 'success'
            ? (
                <Button
                  variant="default"
                  onClick={() => onOpenChange(false)}
                  className="w-full sm:w-auto"
                >
                  Done
                </Button>
              )
            : (
                <>
                  <Button
                    variant="ghost"
                    onClick={() => onOpenChange(false)}
                    disabled={phase === 'charging'}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={purchase}
                    disabled={phase === 'charging'}
                  >
                    {phase === 'charging'
                      ? (
                          <>
                            <Loader2 className="mr-2 size-4 animate-spin" />
                            Charging
                          </>
                        )
                      : (
                          <>
                            Purchase $
                            {amountUsd.toFixed(2)}
                          </>
                        )}
                  </Button>
                </>
              )}
        </DialogFooter>
        {creditsAdded > 0 && phase === 'success' && (
          <p className="text-center text-meta text-muted-foreground">
            {creditsAdded.toLocaleString()}
            {' '}
            credits added.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
