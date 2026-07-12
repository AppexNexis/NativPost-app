'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

const PRESETS = ['10', '20', '50', '100'] as const;
const CREDITS_PER_DOLLAR = 10;

interface Props {
  onBuy: (amountUsd: number) => void;
}

export function BuyCreditsCard({ onBuy }: Props) {
  const [selection, setSelection] = useState<string>('10');
  const [custom, setCustom] = useState<string>('');
  const [coupon, setCoupon] = useState<string>('');

  const amountUsd = selection === 'custom'
    ? Math.max(0, Number(custom) || 0)
    : Number(selection);
  const credits = Math.round(amountUsd * CREDITS_PER_DOLLAR);
  const valid = amountUsd >= 10 && amountUsd <= 1000;

  return (
    <div className="flex flex-col gap-5 rounded-xl border bg-background p-5 dark:bg-neutral-950">
      <div>
        <h3 className="text-base font-semibold">Buy Credits</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Add credits with a one-time payment on your saved card.
        </p>
      </div>

      <RadioGroup
        value={selection}
        onValueChange={setSelection}
        className="grid grid-cols-2 gap-2 sm:grid-cols-5"
      >
        {PRESETS.map(v => (
          <label
            key={v}
            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
              selection === v ? 'border-primary bg-primary/5' : 'hover:bg-muted'
            }`}
          >
            <RadioGroupItem value={v} id={`buy-${v}`} />
            <span className="font-medium">
              $
              {v}
            </span>
          </label>
        ))}
        <label
          className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
            selection === 'custom' ? 'border-primary bg-primary/5' : 'hover:bg-muted'
          }`}
        >
          <RadioGroupItem value="custom" id="buy-custom" />
          <span className="font-medium">Custom</span>
        </label>
      </RadioGroup>

      {selection === 'custom' && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="custom-amount" className="text-xs text-muted-foreground">
            Amount in USD (min $10, max $1000)
          </Label>
          <Input
            id="custom-amount"
            type="number"
            min={10}
            max={1000}
            step={1}
            placeholder="Enter amount"
            value={custom}
            onChange={e => setCustom(e.target.value)}
          />
        </div>
      )}

      <div className="rounded-lg bg-muted/50 p-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">You will receive</span>
          <span className="font-semibold tabular-nums">
            {credits.toLocaleString()}
            {' '}
            credits
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span className="text-muted-foreground">Charge amount</span>
          <span className="font-semibold tabular-nums">
            $
            {amountUsd.toFixed(2)}
          </span>
        </div>
      </div>

      <Button
        disabled={!valid}
        onClick={() => onBuy(amountUsd)}
        className="w-full"
      >
        Quick buy $
        {amountUsd.toFixed(2)}
        {' '}
        credits
      </Button>

      <div className="border-t pt-4">
        <Label htmlFor="coupon" className="text-xs text-muted-foreground">
          Have a coupon?
        </Label>
        <div className="mt-1 flex gap-2">
          <Input
            id="coupon"
            placeholder="Enter code"
            value={coupon}
            onChange={e => setCoupon(e.target.value)}
            disabled
          />
          <Button variant="secondary" disabled>
            Redeem
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Coupons coming soon.</p>
      </div>
    </div>
  );
}
