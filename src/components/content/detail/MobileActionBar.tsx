'use client';

import { Check, Loader2, Send, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';

type Props = {
  status: string;
  canPublish: boolean;
  actionLoading: string | null;
  onApprove: () => void;
  onPublishNow: () => void;
  onOpenReject: () => void;
};

export function MobileActionBar({ status, canPublish, actionLoading, onApprove, onPublishNow, onOpenReject }: Props) {
  const isPending = status === 'pending_review' || status === 'draft';
  const canPublishHere = status === 'approved' || status === 'scheduled';
  const canReject = status !== 'published' && status !== 'rejected';

  if (!isPending && !canPublishHere && !canReject) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-3 py-2.5 backdrop-blur-md lg:hidden">
      <div className="flex items-center gap-2">
        {isPending && (
          <Button className="flex-1" onClick={onApprove} disabled={!!actionLoading}>
            {actionLoading === 'approve' ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Check className="mr-1.5 size-4" />}
            Approve
          </Button>
        )}
        {canPublishHere && (
          <Button className="flex-1" onClick={onPublishNow} disabled={!!actionLoading || !canPublish}>
            {actionLoading === 'publish' ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Send className="mr-1.5 size-4" />}
            Publish now
          </Button>
        )}
        {canReject && (
          <Button variant="outline" size="icon" onClick={onOpenReject} disabled={!!actionLoading} aria-label="Reject">
            <XCircle className="size-4 text-red-500" />
          </Button>
        )}
      </div>
    </div>
  );
}
