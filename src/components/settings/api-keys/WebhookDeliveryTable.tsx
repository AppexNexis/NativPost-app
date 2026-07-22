'use client';

import { CheckCircle2, Loader2, RefreshCcw, XCircle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';

type Delivery = {
  id: string;
  event: string;
  statusCode: number | null;
  status: string;
  errorMessage: string | null;
  durationMs: number | null;
  attemptCount: number;
  deliveredAt: string | null;
  createdAt: string;
};

type Props = {
  endpointId: string;
  refreshKey?: number;
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

export function WebhookDeliveryTable({ endpointId, refreshKey = 0 }: Props) {
  const [rows, setRows] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/settings/webhooks/${endpointId}/deliveries?limit=25`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Failed to load deliveries.');
      }
      const data = await res.json();
      setRows(data.deliveries ?? []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load deliveries.');
    } finally {
      setLoading(false);
    }
  }, [endpointId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Recent deliveries
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void load()}
          disabled={loading}
          className="h-7 text-xs"
        >
          {loading ? <Loader2 className="mr-1.5 size-3 animate-spin" /> : <RefreshCcw className="mr-1.5 size-3" />}
          Refresh
        </Button>
      </div>

      {loading && rows.length === 0
        ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          )
        : error
          ? (
              <p className="text-xs text-red-500">{error}</p>
            )
          : rows.length === 0
            ? (
                <p className="rounded-lg border border-dashed py-6 text-center text-meta text-muted-foreground">
                  No deliveries yet. Send a test payload to see it appear here.
                </p>
              )
            : (
                <div className="overflow-hidden rounded-lg border text-xs">
                  <table className="w-full">
                    <thead className="bg-muted/40 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="px-3 py-2 font-medium">Event</th>
                        <th className="px-3 py-2 font-medium">HTTP</th>
                        <th className="px-3 py-2 font-medium">Duration</th>
                        <th className="px-3 py-2 font-medium">When</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {rows.map((r) => {
                        const isOk = r.status === 'success';
                        return (
                          <tr key={r.id} className="hover:bg-muted/30">
                            <td className="px-3 py-2">
                              {isOk
                                ? (
                                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                                      <CheckCircle2 className="size-3.5" />
                                      Delivered
                                    </span>
                                  )
                                : (
                                    <span className="inline-flex items-center gap-1 text-red-500" title={r.errorMessage ?? undefined}>
                                      <XCircle className="size-3.5" />
                                      {r.status === 'pending' ? 'Pending' : 'Failed'}
                                    </span>
                                  )}
                            </td>
                            <td className="px-3 py-2 font-mono text-micro">{r.event}</td>
                            <td className="px-3 py-2 text-muted-foreground">{r.statusCode ?? '—'}</td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {r.durationMs != null ? `${r.durationMs}ms` : '—'}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {formatTime(r.deliveredAt ?? r.createdAt)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
    </div>
  );
}
