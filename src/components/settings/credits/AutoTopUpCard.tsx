'use client';

import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { AiCreditWallet } from '@/lib/ai-studio/server';

interface Props {
  wallet: AiCreditWallet;
  onSaved: () => Promise<void>;
}

export function AutoTopUpCard({ wallet, onSaved }: Props) {
  const [enabled, setEnabled] = useState(wallet.autoTopUp.enabled);
  const [threshold, setThreshold] = useState<number>(wallet.autoTopUp.threshold);
  const [amountUsd, setAmountUsd] = useState<number>(wallet.autoTopUp.amountUsd);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEnabled(wallet.autoTopUp.enabled);
    setThreshold(wallet.autoTopUp.threshold);
    setAmountUsd(wallet.autoTopUp.amountUsd);
  }, [wallet.autoTopUp.enabled, wallet.autoTopUp.threshold, wallet.autoTopUp.amountUsd]);

  const save = async (nextEnabled: boolean) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/credits/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          autoTopUp: {
            enabled: nextEnabled,
            threshold,
            amountUsd,
          },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save.');
      }
      await onSaved();
    } catch (err: any) {
      setError(err?.message || 'Failed to save.');
      setEnabled(prev => !prev);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 rounded-xl border bg-background p-5 dark:bg-neutral-950">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold">Auto top-up</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Charge your saved card when your balance drops below a limit.
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${
            enabled
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'
              : 'border-border text-muted-foreground'
          }`}
        >
          {enabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="topup-threshold" className="text-xs text-muted-foreground">
            When balance falls below
          </Label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">$</span>
            <Input
              id="topup-threshold"
              type="number"
              min={0}
              step={1}
              value={threshold}
              onChange={e => setThreshold(Number(e.target.value))}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="topup-amount" className="text-xs text-muted-foreground">
            Automatically add
          </Label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">$</span>
            <Input
              id="topup-amount"
              type="number"
              min={10}
              max={1000}
              step={1}
              value={amountUsd}
              onChange={e => setAmountUsd(Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <div className="flex items-center gap-2">
          <Switch
            checked={enabled}
            disabled={saving}
            onCheckedChange={(v) => {
              setEnabled(v);
              save(v);
            }}
          />
          <span className="text-sm">Enable auto top-up</span>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={saving}
          onClick={() => save(enabled)}
        >
          {saving ? <Loader2 className="size-3 animate-spin" /> : 'Save settings'}
        </Button>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
