'use client';

/**
 * TikTokAccountDefaults — reusable publishing defaults for one TikTok account.
 *
 * The middle tier of the settings hierarchy: a campaign that doesn't override
 * anything still publishes with the user's intent instead of a fallback. Saved
 * to `social_account.metadata.tiktokDefaults` and read by the publish cron.
 *
 * Campaign settings win over these; TikTok's live `creator_info` wins over
 * both. See lib/tiktok/resolve-settings.
 */

import { Check, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import type { TikTokPublishConfig } from '@/lib/tiktok/resolve-settings';

import { TikTokSettingsFields } from './TikTokSettingsFields';

type Props = {
  accountId: string;
  accountLabel?: string;
};

export function TikTokAccountDefaults({ accountId, accountLabel }: Props) {
  const [config, setConfig] = useState<TikTokPublishConfig>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/social-accounts/tiktok/defaults?accountId=${encodeURIComponent(accountId)}`,
          { cache: 'no-store' },
        );
        if (res.ok && !cancelled) {
          const data = await res.json() as { defaults?: TikTokPublishConfig };
          setConfig(data.defaults ?? {});
        }
      } catch {
        if (!cancelled) {
          setError('Could not load saved defaults.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/social-accounts/tiktok/defaults', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, defaults: config }),
      });
      if (!res.ok) {
        throw new Error('Save failed');
      }
      setSavedAt(Date.now());
    } catch {
      setError('Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [accountId, config]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading TikTok defaults…
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4">
      <div>
        <h4 className="text-sm font-semibold text-foreground">
          Default TikTok publishing settings
          {accountLabel ? ` · @${accountLabel}` : ''}
        </h4>
        <p className="text-xs text-muted-foreground">
          Used whenever a campaign doesn't set its own. Campaign settings override
          these, and TikTok's own account limits override both at publish time.
        </p>
      </div>

      <TikTokSettingsFields mode="account" value={config} onChange={setConfig} />

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button size="sm" onClick={save} disabled={saving}>
          {saving
            ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  Saving…
                </>
              )
            : 'Save defaults'}
        </Button>
        {savedAt && !saving && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
            <Check className="size-3.5" />
            Saved
          </span>
        )}
      </div>
    </div>
  );
}
