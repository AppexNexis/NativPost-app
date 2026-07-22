'use client';

import { AlertTriangle, Check, Copy, Loader2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
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

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => Promise<void> | void;
};

export function CreateKeyDialog({ open, onOpenChange, onCreated }: Props) {
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const reset = () => {
    setName('');
    setCreating(false);
    setError(null);
    setPlaintext(null);
    setCopied(false);
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      reset();
    }
    onOpenChange(nextOpen);
  };

  const handleCreate = async () => {
    if (!name.trim() || creating) {
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/settings/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to create key.');
      }
      setPlaintext(data.key?.plaintext ?? null);
      await onCreated();
    } catch (err: any) {
      setError(err?.message || 'Failed to create key.');
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async () => {
    if (!plaintext) {
      return;
    }
    try {
      await navigator.clipboard.writeText(plaintext);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore — user can select manually
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        {!plaintext
          ? (
              <>
                <DialogHeader>
                  <DialogTitle>Create API key</DialogTitle>
                  <DialogDescription>
                    Give the key a memorable name so you can revoke it later without
                    breaking other integrations.
                  </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-2 py-2">
                  <Label htmlFor="key-name">Key name</Label>
                  <Input
                    id="key-name"
                    placeholder="e.g. Production Zapier"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    maxLength={80}
                    autoFocus
                  />
                  <p className="text-meta text-muted-foreground">
                    Full access to your workspace. Anyone with this key can publish, edit
                    or delete content on your behalf.
                  </p>
                </div>

                {error && (
                  <p className="text-sm text-red-500">{error}</p>
                )}

                <DialogFooter>
                  <Button variant="outline" onClick={() => handleClose(false)} disabled={creating}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreate} disabled={!name.trim() || creating}>
                    {creating && <Loader2 className="mr-2 size-4 animate-spin" />}
                    Create key
                  </Button>
                </DialogFooter>
              </>
            )
          : (
              <>
                <DialogHeader>
                  <DialogTitle>Save your API key</DialogTitle>
                  <DialogDescription>
                    Copy this key now. For your security, it will never be shown again.
                  </DialogDescription>
                </DialogHeader>

                <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>
                    Treat this key like a password. Store it in a secrets manager and never
                    commit it to source control.
                  </span>
                </div>

                <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
                  <code className="flex-1 truncate font-mono text-xs">{plaintext}</code>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleCopy}
                    className="shrink-0"
                  >
                    {copied
                      ? (
                          <>
                            <Check className="mr-1.5 size-3.5" />
                            Copied
                          </>
                        )
                      : (
                          <>
                            <Copy className="mr-1.5 size-3.5" />
                            Copy
                          </>
                        )}
                  </Button>
                </div>

                <DialogFooter>
                  <Button onClick={() => handleClose(false)}>
                    Done
                  </Button>
                </DialogFooter>
              </>
            )}
      </DialogContent>
    </Dialog>
  );
}
