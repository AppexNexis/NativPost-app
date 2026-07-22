'use client';

import { KeyRound, Loader2, Plus, Webhook } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';

import type { ApiKeyRow } from './ApiKeyTable';
import { ApiKeyTable } from './ApiKeyTable';
import { CreateKeyDialog } from './CreateKeyDialog';
import type { RevokeTarget } from './RevokeKeyDialog';
import { RevokeKeyDialog } from './RevokeKeyDialog';
import { UpgradeBanner } from './UpgradeBanner';
import type { WebhookEndpoint } from './WebhookCard';
import { WebhookCard } from './WebhookCard';
import type { WebhookEndpointForForm } from './WebhookDialog';
import { WebhookDialog } from './WebhookDialog';

type Gate =
  | { kind: 'loading' }
  | { kind: 'ok' }
  | { kind: 'upgrade'; currentPlan: string | null; inactive: boolean }
  | { kind: 'error'; message: string };

export function ApiKeysPanel() {
  const [gate, setGate] = useState<Gate>({ kind: 'loading' });

  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookEndpoint[]>([]);
  const [availableEvents, setAvailableEvents] = useState<string[]>([]);

  const [createKeyOpen, setCreateKeyOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<RevokeTarget | null>(null);

  const [webhookDialog, setWebhookDialog] = useState<{
    open: boolean;
    mode: 'create' | 'edit';
    initial?: WebhookEndpointForForm;
  }>({ open: false, mode: 'create' });

  const loadKeys = useCallback(async () => {
    const res = await fetch('/api/settings/api-keys');
    const data = await res.json().catch(() => ({}));
    if (res.status === 402 || res.status === 403) {
      setGate({
        kind: 'upgrade',
        currentPlan: data?.currentPlan ?? null,
        inactive: res.status === 402,
      });
      return false;
    }
    if (!res.ok) {
      setGate({ kind: 'error', message: data?.error || 'Failed to load API keys.' });
      return false;
    }
    setKeys(data.keys ?? []);
    return true;
  }, []);

  const loadWebhooks = useCallback(async () => {
    const res = await fetch('/api/settings/webhooks');
    const data = await res.json().catch(() => ({}));
    if (res.status === 402 || res.status === 403) {
      setGate({
        kind: 'upgrade',
        currentPlan: data?.currentPlan ?? null,
        inactive: res.status === 402,
      });
      return false;
    }
    if (!res.ok) {
      setGate({ kind: 'error', message: data?.error || 'Failed to load webhooks.' });
      return false;
    }
    setWebhooks(data.endpoints ?? []);
    setAvailableEvents(data.availableEvents ?? []);
    return true;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const keysOk = await loadKeys();
      if (cancelled || !keysOk) {
        return;
      }
      const hooksOk = await loadWebhooks();
      if (cancelled || !hooksOk) {
        return;
      }
      setGate({ kind: 'ok' });
    })();
    return () => {
      cancelled = true;
    };
  }, [loadKeys, loadWebhooks]);

  if (gate.kind === 'loading') {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (gate.kind === 'upgrade') {
    return (
      <div className="py-2">
        <UpgradeBanner currentPlan={gate.currentPlan} inactive={gate.inactive} />
      </div>
    );
  }

  if (gate.kind === 'error') {
    return (
      <div className="rounded-lg border border-red-500/40 bg-red-500/5 p-4 text-sm text-red-500">
        {gate.message}
      </div>
    );
  }

  const refreshKeys = async () => {
    await loadKeys();
  };
  const refreshWebhooks = async () => {
    await loadWebhooks();
  };

  return (
    <div className="flex flex-col gap-8 py-2">
      {/* ── API keys ── */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-muted p-2 text-muted-foreground">
              <KeyRound className="size-4" />
            </div>
            <div>
              <h3 className="text-heading">API keys</h3>
              <p className="mt-0.5 text-body text-muted-foreground">
                Bearer tokens used to authenticate calls to
                {' '}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">/api/v1</code>
                . Each key has full workspace access — revoke immediately if leaked.
              </p>
            </div>
          </div>
          <Button size="sm" onClick={() => setCreateKeyOpen(true)}>
            <Plus className="mr-1.5 size-4" />
            New API key
          </Button>
        </div>

        <ApiKeyTable rows={keys} onRevokeRequest={setRevokeTarget} />
      </section>

      {/* ── Webhooks ── */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-muted p-2 text-muted-foreground">
              <Webhook className="size-4" />
            </div>
            <div>
              <h3 className="text-heading">Webhook endpoints</h3>
              <p className="mt-0.5 text-body text-muted-foreground">
                NativPost POSTs signed JSON to these URLs when events happen in your
                workspace. Verify
                {' '}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">NativPost-Signature</code>
                {' '}
                using the signing secret before trusting a payload.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => setWebhookDialog({ open: true, mode: 'create' })}
          >
            <Plus className="mr-1.5 size-4" />
            Add endpoint
          </Button>
        </div>

        {webhooks.length === 0
          ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-12 text-center">
                <div className="rounded-full bg-muted p-3 text-muted-foreground">
                  <Webhook className="size-5" />
                </div>
                <p className="text-sm font-medium">No webhook endpoints yet</p>
                <p className="max-w-sm text-meta text-muted-foreground">
                  Add an endpoint to receive real-time events when content is created,
                  approved, published, or when a campaign launches.
                </p>
              </div>
            )
          : (
              <div className="flex flex-col gap-4">
                {webhooks.map(wh => (
                  <WebhookCard
                    key={wh.id}
                    endpoint={wh}
                    onEdit={endpoint =>
                      setWebhookDialog({
                        open: true,
                        mode: 'edit',
                        initial: {
                          id: endpoint.id,
                          url: endpoint.url,
                          events: endpoint.events,
                          description: endpoint.description,
                          enabled: endpoint.enabled,
                        },
                      })}
                    onChanged={refreshWebhooks}
                  />
                ))}
              </div>
            )}
      </section>

      {/* Dialogs */}
      <CreateKeyDialog
        open={createKeyOpen}
        onOpenChange={setCreateKeyOpen}
        onCreated={refreshKeys}
      />
      <RevokeKeyDialog
        target={revokeTarget}
        onOpenChange={open => (open ? null : setRevokeTarget(null))}
        onRevoked={refreshKeys}
      />
      <WebhookDialog
        open={webhookDialog.open}
        mode={webhookDialog.mode}
        initial={webhookDialog.initial}
        availableEvents={availableEvents}
        onOpenChange={open => setWebhookDialog(prev => ({ ...prev, open }))}
        onSaved={refreshWebhooks}
      />
    </div>
  );
}
