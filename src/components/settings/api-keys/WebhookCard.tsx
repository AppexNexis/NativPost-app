'use client';

import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  MoreHorizontal,
  Pencil,
  RefreshCcw,
  Send,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { WebhookDeliveryTable } from './WebhookDeliveryTable';

export type WebhookEndpoint = {
  id: string;
  url: string;
  secret: string;
  events: string[];
  description: string | null;
  enabled: boolean;
  consecutiveFailures: number;
  disabledAt: string | null;
  createdAt: string;
};

type Props = {
  endpoint: WebhookEndpoint;
  onEdit: (endpoint: WebhookEndpoint) => void;
  onChanged: () => Promise<void> | void;
};

type Feedback = {
  kind: 'success' | 'error' | 'info';
  message: string;
};

export function WebhookCard({ endpoint, onEdit, onChanged }: Props) {
  const [showSecret, setShowSecret] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [testing, setTesting] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const setTransientFeedback = (f: Feedback) => {
    setFeedback(f);
    setTimeout(() => setFeedback(prev => (prev === f ? null : prev)), 5000);
  };

  const copySecret = async () => {
    try {
      await navigator.clipboard.writeText(endpoint.secret);
      setTransientFeedback({ kind: 'success', message: 'Signing secret copied to clipboard.' });
    } catch {
      setTransientFeedback({ kind: 'error', message: 'Copy failed. Reveal and copy manually.' });
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/settings/webhooks/${endpoint.id}/test`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setTransientFeedback({
          kind: 'success',
          message: `Delivered ${data.statusCode ?? 'OK'} in ${data.durationMs}ms.`,
        });
      } else {
        setTransientFeedback({
          kind: 'error',
          message: data.errorMessage
            ? `Test failed: ${data.errorMessage}`
            : `Test failed with HTTP ${data.statusCode ?? '?'}.`,
        });
      }
      setRefreshKey(k => k + 1);
      setExpanded(true);
    } catch (err: any) {
      setTransientFeedback({ kind: 'error', message: err?.message || 'Test request failed.' });
    } finally {
      setTesting(false);
    }
  };

  const handleRotate = async () => {
    if (!confirm('Rotate the signing secret? The old secret stops working immediately.')) return;
    setRotating(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/settings/webhooks/${endpoint.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rotateSecret: true }),
      });
      if (!res.ok) throw new Error('Rotate failed');
      await onChanged();
      setShowSecret(true);
      setTransientFeedback({ kind: 'info', message: 'Signing secret rotated. Update every receiver.' });
    } catch (err: any) {
      setTransientFeedback({ kind: 'error', message: err?.message || 'Rotate failed.' });
    } finally {
      setRotating(false);
    }
  };

  const handleToggleEnabled = async () => {
    setToggling(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/settings/webhooks/${endpoint.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !endpoint.enabled }),
      });
      if (!res.ok) throw new Error('Toggle failed');
      await onChanged();
    } catch (err: any) {
      setTransientFeedback({ kind: 'error', message: err?.message || 'Toggle failed.' });
    } finally {
      setToggling(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this webhook endpoint? Delivery history will be removed too.')) return;
    setDeleting(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/settings/webhooks/${endpoint.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      await onChanged();
    } catch (err: any) {
      setTransientFeedback({ kind: 'error', message: err?.message || 'Delete failed.' });
    } finally {
      setDeleting(false);
    }
  };

  const eventLabel = endpoint.events.length === 0
    ? 'All events (including future events)'
    : `${endpoint.events.length} event${endpoint.events.length === 1 ? '' : 's'}`;

  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-background p-5 dark:bg-neutral-950">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <code className="max-w-full truncate rounded bg-muted px-2 py-1 font-mono text-xs">
              {endpoint.url}
            </code>
            <span
              className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                endpoint.enabled
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'
                  : 'border-border text-muted-foreground'
              }`}
            >
              {endpoint.enabled ? 'Enabled' : 'Disabled'}
            </span>
            {endpoint.disabledAt && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-500">
                <AlertTriangle className="size-3" />
                Auto-disabled
              </span>
            )}
          </div>
          {endpoint.description && (
            <p className="text-sm text-muted-foreground">{endpoint.description}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {eventLabel}
            {endpoint.consecutiveFailures > 0 && (
              <>
                {' · '}
                <span className="text-amber-500">
                  {endpoint.consecutiveFailures}
                  {' '}
                  consecutive failure
                  {endpoint.consecutiveFailures === 1 ? '' : 's'}
                </span>
              </>
            )}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleTest}
            disabled={testing || !endpoint.enabled}
          >
            {testing ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Send className="mr-1.5 size-3.5" />}
            Test
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8">
                <MoreHorizontal className="size-4" />
                <span className="sr-only">Actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(endpoint)}>
                <Pencil className="mr-2 size-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleToggleEnabled} disabled={toggling}>
                {toggling && <Loader2 className="mr-2 size-4 animate-spin" />}
                {endpoint.enabled ? 'Disable' : 'Enable'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleRotate} disabled={rotating}>
                {rotating ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCcw className="mr-2 size-4" />}
                Rotate secret
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleDelete}
                disabled={deleting}
                className="text-red-500 focus:text-red-500"
              >
                {deleting ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Trash2 className="mr-2 size-4" />}
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
        <code className="flex-1 truncate font-mono text-xs">
          {showSecret ? endpoint.secret : '•'.repeat(Math.min(endpoint.secret.length, 44))}
        </code>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => setShowSecret(v => !v)}
        >
          {showSecret ? <EyeOff className="mr-1.5 size-3.5" /> : <Eye className="mr-1.5 size-3.5" />}
          {showSecret ? 'Hide' : 'Reveal'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={copySecret}
        >
          <Copy className="mr-1.5 size-3.5" />
          Copy
        </Button>
      </div>

      {feedback && (
        <p
          className={`text-xs ${
            feedback.kind === 'success'
              ? 'text-emerald-500'
              : feedback.kind === 'error'
                ? 'text-red-500'
                : 'text-muted-foreground'
          }`}
        >
          {feedback.message}
        </p>
      )}

      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-1.5 self-start text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        {expanded ? 'Hide delivery log' : 'Show delivery log'}
      </button>

      {expanded && (
        <WebhookDeliveryTable endpointId={endpoint.id} refreshKey={refreshKey} />
      )}
    </div>
  );
}
