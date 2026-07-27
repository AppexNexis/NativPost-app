'use client';

import { HardDrive, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

type StorageUsage = {
  usedBytes: number;
  limitBytes: number;
};

// -----------------------------------------------------------
// formatBytes — human-readable size (e.g. "512 MB", "1.4 GB").
// -----------------------------------------------------------
function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) {
    return '0 MB';
  }
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    return `${gb.toFixed(gb >= 10 ? 0 : 1)} GB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
}

export function StoragePanel() {
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/media-assets/usage', { cache: 'no-store' });
        if (!res.ok) {
          throw new Error('Failed to load storage usage');
        }
        const data = await res.json();
        if (!cancelled) {
          setUsage({ usedBytes: Number(data.usedBytes) || 0, limitBytes: Number(data.limitBytes) || 0 });
        }
      } catch {
        if (!cancelled) {
          setError('Unable to load storage usage.');
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
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !usage) {
    return (
      <div className="rounded-lg border border-red-500/40 bg-red-500/5 p-4 text-sm text-red-500">
        {error ?? 'Unable to load storage usage.'}
      </div>
    );
  }

  const unlimited = usage.limitBytes === -1;
  const pct = unlimited || usage.limitBytes === 0
    ? 0
    : Math.min(100, Math.round((usage.usedBytes / usage.limitBytes) * 100));
  const nearLimit = !unlimited && pct >= 90;
  const barColor = nearLimit ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-primary';

  return (
    <div className="flex flex-col gap-6 py-2">
      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg border bg-background">
            <HardDrive className="size-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">Media storage</p>
            <p className="text-meta text-muted-foreground">
              Space used by uploaded images and videos across this workspace.
            </p>
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-medium">
              {formatBytes(usage.usedBytes)}
              {' '}
              <span className="font-normal text-muted-foreground">used</span>
            </p>
            <p className="text-meta text-muted-foreground">
              {unlimited ? 'Unlimited' : `of ${formatBytes(usage.limitBytes)}`}
            </p>
          </div>

          {!unlimited && (
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-all ${barColor}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          )}

          {nearLimit && (
            <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-meta text-amber-700 dark:text-amber-400">
              You are close to your storage limit.
              {' '}
              <a href="/dashboard/billing" className="font-medium underline underline-offset-2">
                Upgrade for more space
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
