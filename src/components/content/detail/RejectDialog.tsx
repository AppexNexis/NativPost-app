'use client';

import { Loader2, XCircle } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: (feedback: string) => Promise<void> | void;
  isBusy?: boolean;
};

export function RejectDialog({ open, onOpenChange, onConfirm, isBusy = false }: Props) {
  const [feedback, setFeedback] = useState('');

  const handleConfirm = async () => {
    await onConfirm(feedback);
    setFeedback('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle className="size-5 text-red-500" />
            Reject this post
          </DialogTitle>
          <DialogDescription>
            The engine uses your feedback to learn what to avoid next time. This is optional but recommended.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={feedback}
          onChange={e => setFeedback(e.target.value)}
          placeholder="Why is this being rejected? e.g. tone doesn't match, hook is weak, wrong angle..."
          className="min-h-[100px] text-sm"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={isBusy}>
            {isBusy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Reject
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
