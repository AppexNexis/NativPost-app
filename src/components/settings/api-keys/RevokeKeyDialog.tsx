'use client';

import { Loader2 } from 'lucide-react';
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

export type RevokeTarget = {
  id: string;
  name: string;
  lastFour: string;
};

type Props = {
  target: RevokeTarget | null;
  onOpenChange: (open: boolean) => void;
  onRevoked: () => Promise<void> | void;
};

export function RevokeKeyDialog({ target, onOpenChange, onRevoked }: Props) {
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    if (revoking) return;
    setError(null);
    onOpenChange(false);
  };

  const handleRevoke = async () => {
    if (!target) return;
    setRevoking(true);
    setError(null);
    try {
      const res = await fetch(`/api/settings/api-keys/${target.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Failed to revoke key.');
      }
      await onRevoked();
      onOpenChange(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to revoke key.');
    } finally {
      setRevoking(false);
    }
  };

  return (
    <Dialog open={target !== null} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Revoke API key</DialogTitle>
          <DialogDescription>
            {target
              ? (
                  <>
                    This revokes
                    {' '}
                    <span className="font-medium text-foreground">{target.name}</span>
                    {' '}
                    (ending in
                    {' '}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">{target.lastFour}</code>
                    ). Any integration still using it will start receiving
                    {' '}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">401 revoked</code>
                    {' '}
                    on the next request.
                  </>
                )
              : null}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p className="text-sm text-red-500">{error}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={revoking}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleRevoke}
            disabled={revoking}
          >
            {revoking && <Loader2 className="mr-2 size-4 animate-spin" />}
            Revoke key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
