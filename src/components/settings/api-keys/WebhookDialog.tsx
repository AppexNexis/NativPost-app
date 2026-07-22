'use client';

import { Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export type WebhookEndpointForForm = {
  id?: string;
  url: string;
  events: string[];
  description: string | null;
  enabled: boolean;
};

type Props = {
  open: boolean;
  mode: 'create' | 'edit';
  initial?: WebhookEndpointForForm;
  availableEvents: string[];
  onOpenChange: (v: boolean) => void;
  onSaved: () => Promise<void> | void;
};

const EVENT_GROUPS: Record<string, string> = {
  content: 'Content lifecycle',
  campaign: 'Campaign lifecycle',
  social_account: 'Connections',
};

export function WebhookDialog({
  open,
  mode,
  initial,
  availableEvents,
  onOpenChange,
  onSaved,
}: Props) {
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setUrl(initial?.url ?? '');
      setEvents(initial?.events ?? []);
      setDescription(initial?.description ?? '');
      setEnabled(initial?.enabled ?? true);
      setError(null);
    }
  }, [open, initial]);

  const grouped = useMemo(() => {
    const g: Record<string, string[]> = {};
    for (const evt of availableEvents) {
      const key = evt.split('.')[0] ?? 'other';
      (g[key] ||= []).push(evt);
    }
    return g;
  }, [availableEvents]);

  const toggleEvent = (evt: string) => {
    setEvents(prev => prev.includes(evt) ? prev.filter(e => e !== evt) : [...prev, evt]);
  };

  const toggleGroup = (group: string) => {
    const groupEvents = grouped[group] ?? [];
    const allOn = groupEvents.every(e => events.includes(e));
    if (allOn) {
      setEvents(prev => prev.filter(e => !groupEvents.includes(e)));
    } else {
      setEvents(prev => Array.from(new Set([...prev, ...groupEvents])));
    }
  };

  const handleSave = async () => {
    if (!url.trim() || saving) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const isEdit = mode === 'edit' && initial?.id;
      const res = await fetch(
        isEdit
          ? `/api/settings/webhooks/${initial!.id}`
          : '/api/settings/webhooks',
        {
          method: isEdit ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: url.trim(),
            events,
            description: description.trim() || null,
            enabled,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to save webhook.');
      }
      await onSaved();
      onOpenChange(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to save webhook.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={saving ? undefined : onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Add webhook endpoint' : 'Edit webhook endpoint'}</DialogTitle>
          <DialogDescription>
            NativPost will POST signed JSON payloads to this URL when the selected
            events occur. Responses in the 2xx range mark the delivery successful.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wh-url">Endpoint URL</Label>
            <Input
              id="wh-url"
              type="url"
              placeholder="https://example.com/webhooks/nativpost"
              value={url}
              onChange={e => setUrl(e.target.value)}
              maxLength={2048}
              autoFocus
            />
            <p className="text-meta text-muted-foreground">
              Must be HTTPS in production. NativPost sends
              {' '}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">NativPost-Signature</code>
              {' '}
              on every request — verify it before trusting the body.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wh-desc">Description (optional)</Label>
            <Textarea
              id="wh-desc"
              placeholder="What is this endpoint for?"
              value={description}
              onChange={e => setDescription(e.target.value)}
              maxLength={280}
              rows={2}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Events</Label>
            {Object.entries(grouped).map(([group, groupEvents]) => {
              const allOn = groupEvents.every(e => events.includes(e));
              const someOn = groupEvents.some(e => events.includes(e));
              return (
                <div key={group} className="rounded-lg border">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium hover:bg-muted/40"
                  >
                    <span>{EVENT_GROUPS[group] ?? group}</span>
                    <span className="text-meta text-muted-foreground">
                      {allOn ? 'All on' : someOn ? 'Some on' : 'Off'}
                    </span>
                  </button>
                  <div className="grid grid-cols-1 gap-1.5 border-t px-3 py-2 sm:grid-cols-2">
                    {groupEvents.map(evt => (
                      <label
                        key={evt}
                        className="flex cursor-pointer items-center gap-2 text-meta text-muted-foreground hover:text-foreground"
                      >
                        <Checkbox
                          checked={events.includes(evt)}
                          onCheckedChange={() => toggleEvent(evt)}
                        />
                        <code className="font-mono">{evt}</code>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
            <p className="text-meta text-muted-foreground">
              Leave everything unchecked to receive every event NativPost adds in the
              future.
            </p>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={enabled}
              onCheckedChange={v => setEnabled(v === true)}
            />
            Enabled
          </label>
        </div>

        {error && (
          <p className="text-sm text-red-500">{error}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!url.trim() || saving}>
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
            {mode === 'create' ? 'Add endpoint' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
