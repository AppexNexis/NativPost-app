'use client';

import { Info, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import type { AiCreditWallet } from '@/lib/ai-studio/server';
import { cn } from '@/utils/Helpers';

interface Props {
  wallet: AiCreditWallet;
  onConfigChanged: () => Promise<void>;
}

function balanceUsd(wallet: AiCreditWallet): number {
  const monthlyRemaining = Math.max(0, wallet.monthly.limit - wallet.monthly.used);
  const reserved = wallet.reservedCredits ?? 0;
  const credits = Math.max(0, monthlyRemaining + wallet.addon.remaining - reserved);
  return credits / 10;
}

function usageUsd(wallet: AiCreditWallet): number {
  return (wallet.monthlyUsage?.creditsSpent ?? 0) / 10;
}

function daysThroughMonth(): number {
  return new Date().getUTCDate();
}

function fmtCurrency(v: number): string {
  return `$${v.toFixed(2)}`;
}

function Cell({
  label,
  value,
  hint,
  className,
  children,
}: {
  label: string;
  value?: string;
  hint?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-xl border bg-background p-5 dark:bg-neutral-950',
        className,
      )}
    >
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
        <Info className="size-3 opacity-60" />
      </div>
      {value !== undefined && (
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
      )}
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      {children}
    </div>
  );
}

export function BalanceGrid({ wallet, onConfigChanged }: Props) {
  const [alertEnabled, setAlertEnabled] = useState(wallet.lowBalanceAlert.enabled);
  const [threshold, setThreshold] = useState<number>(wallet.lowBalanceAlert.threshold);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAlertEnabled(wallet.lowBalanceAlert.enabled);
    setThreshold(wallet.lowBalanceAlert.threshold);
  }, [wallet.lowBalanceAlert.enabled, wallet.lowBalanceAlert.threshold]);

  const balance = balanceUsd(wallet);
  const spent = usageUsd(wallet);
  const days = daysThroughMonth();
  const dailyAverage = days > 0 ? spent / days : 0;

  const saveAlert = async (payload: { enabled?: boolean; threshold?: number }) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/credits/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lowBalanceAlert: payload }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save.');
      }
      await onConfigChanged();
    } catch (err: any) {
      setError(err?.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Cell
        label="Current balance"
        value={fmtCurrency(balance)}
        hint="One time payments only"
      />
      <Cell
        label="Credits expiring next 30 days"
        value="$0.00"
        hint="Credits do not expire"
      />
      <Cell
        label="Usage this month"
        value={fmtCurrency(spent)}
        hint={`Averaging ${fmtCurrency(dailyAverage)} / day`}
      />
      <Cell label="Low balance email alert" className="gap-2">
        <div className="mt-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Alert at</span>
            <Input
              type="number"
              min={0}
              step={1}
              value={threshold}
              onChange={e => setThreshold(Number(e.target.value))}
              className="h-8 w-20 text-sm"
            />
          </div>
          <Switch
            checked={alertEnabled}
            onCheckedChange={(v) => {
              setAlertEnabled(v);
              saveAlert({ enabled: v });
            }}
          />
        </div>
        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            variant="secondary"
            disabled={saving}
            onClick={() => saveAlert({ threshold, enabled: true })}
          >
            {saving ? <Loader2 className="size-3 animate-spin" /> : 'Update'}
          </Button>
          {alertEnabled && (
            <Button
              size="sm"
              variant="ghost"
              disabled={saving}
              onClick={() => {
                setAlertEnabled(false);
                saveAlert({ enabled: false });
              }}
            >
              Disable
            </Button>
          )}
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </Cell>
    </div>
  );
}
