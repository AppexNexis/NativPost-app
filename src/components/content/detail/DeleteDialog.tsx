'use client';

import { AlertTriangle, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: () => Promise<void> | void;
  captionPreview?: string;
  isBusy?: boolean;
};

export function DeleteDialog({ open, onOpenChange, onConfirm, captionPreview, isBusy = false }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-red-500" />
            Delete this post?
          </DialogTitle>
          <DialogDescription>
            This cannot be undone. The post, its scheduled publishes, and any drafts will be removed.
          </DialogDescription>
        </DialogHeader>
        {captionPreview && (
          <div className="rounded-md border bg-muted/40 px-3 py-2">
            <p className="line-clamp-3 text-meta text-muted-foreground">
              {captionPreview}
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isBusy}>
            {isBusy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
