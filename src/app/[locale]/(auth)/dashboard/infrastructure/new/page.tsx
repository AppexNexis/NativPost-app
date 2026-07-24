'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Clock, Loader2, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageHeader } from '@/features/dashboard/PageHeader';
import { MSI_COUNTRIES, MSI_PLATFORMS } from '@/lib/msi/catalog';
import { MSI_PER_ACCOUNT_USD } from '@/lib/msi/pricing';

type Brand = { id: string; brandName: string };

type Assessment = {
  immediate: boolean;
  feasible: boolean;
  waitlist: boolean;
  etaDays: number | null;
  confidence: number;
  availableNow: number;
};

function CapacityPanel({
  country,
  platform,
  quantity,
}: {
  country: string;
  platform: string;
  quantity: number;
}) {
  const { data, isFetching } = useQuery({
    queryKey: ['msi-capacity', country, platform, quantity],
    enabled: Boolean(country && platform && quantity > 0),
    queryFn: async (): Promise<Assessment> => {
      const res = await fetch(
        `/api/msi/capacity?country=${encodeURIComponent(country)}&platform=${encodeURIComponent(platform)}&quantity=${quantity}`,
      );
      if (!res.ok) {
        throw new Error('capacity');
      }
      const body = await res.json();
      return body.assessment;
    },
  });

  if (isFetching && !data) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Checking availability…
      </div>
    );
  }
  if (!data) {
    return null;
  }

  const confidencePct = Math.round(data.confidence * 100);

  if (data.immediate) {
    return (
      <div className="flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
        <span>
          Available now — ready in about
          {' '}
          <strong>
            {data.etaDays}
            {' '}
            days
          </strong>
          {' '}
          (
          {confidencePct}
          % confidence).
        </span>
      </div>
    );
  }
  if (data.waitlist) {
    return (
      <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
        <Clock className="mt-0.5 size-4 shrink-0" />
        <span>
          At capacity in this market right now. You can still configure — we'll
          confirm timing before anything goes ahead.
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
      <Clock className="mt-0.5 size-4 shrink-0" />
      <span>
        Estimated
        {' '}
        <strong>
          ~
          {data.etaDays}
          {' '}
          days
        </strong>
        {' '}
        (
        {confidencePct}
        % confidence), including time in the build queue.
      </span>
    </div>
  );
}

export default function ConfigureAccountsPage() {
  const { data: brandsData, isLoading: brandsLoading } = useQuery({
    queryKey: ['msi-brands'],
    queryFn: async (): Promise<Brand[]> => {
      const res = await fetch('/api/msi/brands');
      if (!res.ok) {
        throw new Error('brands');
      }
      const body = await res.json();
      return body.brands ?? [];
    },
  });
  const brands = useMemo(() => brandsData ?? [], [brandsData]);

  const [brandId, setBrandId] = useState('');
  const [country, setCountry] = useState('US');
  const [platform, setPlatform] = useState('tiktok');
  const [niche, setNiche] = useState('');
  const [handlesText, setHandlesText] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [authorized, setAuthorized] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const brandName = brands.find(b => b.id === brandId)?.brandName ?? 'your brand';
  const platformLabel
    = MSI_PLATFORMS.find(p => p.value === platform)?.label ?? platform;
  const countryLabel
    = MSI_COUNTRIES.find(c => c.value === country)?.label ?? country;

  const canSubmit = Boolean(brandId) && authorized && !submitting;

  const submit = async () => {
    setSubmitting(true);
    try {
      const handlePreferences = handlesText
        .split(',')
        .map(h => h.trim())
        .filter(Boolean);
      const res = await fetch('/api/msi/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandProfileId: brandId,
          country,
          platform,
          niche: niche || null,
          handlePreferences,
          quantity,
          authorized,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server returned ${res.status}`);
      }
      const { order } = await res.json();
      // Proceed to Stripe checkout; fall back to a saved state if unavailable.
      try {
        const checkout = await fetch(`/api/msi/orders/${order.id}/checkout`, {
          method: 'POST',
        });
        if (checkout.ok) {
          const { url } = await checkout.json();
          if (typeof url === 'string' && url) {
            window.location.href = url;
            return;
          }
        }
      } catch {
        // fall through to the saved state
      }
      setDone(true);
      toast.success('Configuration saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Link
        href="/dashboard/infrastructure"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Infrastructure
      </Link>

      {done
        ? (
            <div className="rounded-xl border border-border bg-card p-6 text-center">
              <CheckCircle2 className="mx-auto size-10 text-emerald-500" />
              <h2 className="mt-3 text-lg font-semibold text-foreground">
                Configuration saved
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                We've recorded your setup and authorization for
                {' '}
                {platformLabel}
                {' '}
                in
                {' '}
                {countryLabel}
                . Nothing has been charged and no accounts have been created yet —
                our team reviews and confirms timing before anything goes ahead.
              </p>
              <Button asChild className="mt-5">
                <Link href="/dashboard/infrastructure">Back to Infrastructure</Link>
              </Button>
            </div>
          )
        : (
            <>
              <PageHeader
                title="Configure managed accounts"
                description="Set up the accounts you'd like us to run. This saves your configuration — no payment, nothing goes live yet."
              />

              {!brandsLoading && brands.length === 0
                ? (
                    <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
                      You'll need a Brand Profile first — managed accounts are always
                      tied to a real brand you own.
                      {' '}
                      <Link
                        href="/dashboard/brand-profile"
                        className="font-medium text-primary hover:underline"
                      >
                        Create a Brand Profile
                      </Link>
                      .
                    </div>
                  )
                : (
                    <div className="space-y-5 rounded-xl border border-border bg-card p-5">
                      <div className="grid gap-1.5">
                        <Label htmlFor="brand">Brand</Label>
                        <Select value={brandId} onValueChange={setBrandId}>
                          <SelectTrigger id="brand">
                            <SelectValue placeholder="Select a brand" />
                          </SelectTrigger>
                          <SelectContent>
                            {brands.map(b => (
                              <SelectItem key={b.id} value={b.id}>
                                {b.brandName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-1.5">
                          <Label htmlFor="country">Country</Label>
                          <Select value={country} onValueChange={setCountry}>
                            <SelectTrigger id="country">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {MSI_COUNTRIES.map(c => (
                                <SelectItem key={c.value} value={c.value}>
                                  {c.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-1.5">
                          <Label htmlFor="platform">Platform</Label>
                          <Select value={platform} onValueChange={setPlatform}>
                            <SelectTrigger id="platform">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {MSI_PLATFORMS.map(p => (
                                <SelectItem key={p.value} value={p.value}>
                                  {p.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-1.5">
                          <Label htmlFor="niche">Niche</Label>
                          <Input
                            id="niche"
                            placeholder="e.g. Home wellness"
                            value={niche}
                            onChange={e => setNiche(e.target.value)}
                          />
                        </div>
                        <div className="grid gap-1.5">
                          <Label htmlFor="quantity">Number of accounts</Label>
                          <Input
                            id="quantity"
                            type="number"
                            min={1}
                            max={100}
                            value={quantity}
                            onChange={e =>
                              setQuantity(Math.max(1, Number(e.target.value) || 1))}
                          />
                        </div>
                      </div>

                      <div className="grid gap-1.5">
                        <Label htmlFor="handles">Handle preferences</Label>
                        <Input
                          id="handles"
                          placeholder="@acme_ai, @acmehq (comma separated)"
                          value={handlesText}
                          onChange={e => setHandlesText(e.target.value)}
                        />
                        <p className="text-micro text-muted-foreground">
                          We try these in order; the first available one is used.
                        </p>
                      </div>

                      <CapacityPanel
                        country={country}
                        platform={platform}
                        quantity={quantity}
                      />

                      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3">
                        <input
                          type="checkbox"
                          className="mt-0.5 size-4"
                          checked={authorized}
                          onChange={e => setAuthorized(e.target.checked)}
                        />
                        <span className="flex items-start gap-2 text-sm text-muted-foreground">
                          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                          <span>
                            I authorize NativPost to create and operate
                            {' '}
                            {platformLabel}
                            {' '}
                            account(s) in
                            {' '}
                            {countryLabel}
                            {' '}
                            on behalf of
                            {' '}
                            <strong className="text-foreground">{brandName}</strong>
                            , which I own. I can revoke this and retrieve the
                            credentials at any time.
                          </span>
                        </span>
                      </label>

                      <div className="flex items-center justify-between gap-3">
                        <p className="text-micro text-muted-foreground">
                          {`$${MSI_PER_ACCOUNT_USD * quantity}/mo · secure checkout`}
                        </p>
                        <Button disabled={!canSubmit} onClick={submit}>
                          {submitting
                            ? (
                                <>
                                  <Loader2 className="mr-2 size-4 animate-spin" />
                                  Saving…
                                </>
                              )
                            : (
                                'Continue to payment'
                              )}
                        </Button>
                      </div>
                    </div>
                  )}
            </>
          )}
    </div>
  );
}
