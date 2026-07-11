'use client';

import { Calendar, Check, Loader2, RefreshCw, Send, Trash2, Wand2, XCircle, Zap } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export type ActionsPanelHandlers = {
  onApprove: () => void;
  onOpenReject: () => void;
  onOpenDelete: () => void;
  onOpenSchedule: () => void;
  onPublishNow: () => void;
  onReRoll?: () => void;
  onRemix?: () => void;
};

type Props = ActionsPanelHandlers & {
  status: string;
  canPublish: boolean;
  hasScheduled: boolean;
  campaignReRollsRemaining?: number | null;
  hasTemplate?: boolean;
  actionLoading: string | null;
};

export function ActionsPanel({
  status,
  canPublish,
  hasScheduled,
  campaignReRollsRemaining,
  hasTemplate,
  actionLoading,
  onApprove,
  onOpenReject,
  onOpenDelete,
  onOpenSchedule,
  onPublishNow,
  onReRoll,
  onRemix,
}: Props) {
  const isPending = status === 'pending_review' || status === 'draft';
  const isApproved = status === 'approved';
  const isScheduled = status === 'scheduled';
  const canReject = status !== 'published' && status !== 'rejected';

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2 border-b pb-3">
        <Zap className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Actions</h3>
      </div>

      <div className="space-y-2">
        {isPending && (
          <Button className="w-full" onClick={onApprove} disabled={!!actionLoading}>
            {actionLoading === 'approve' ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Check className="mr-2 size-4" />}
            Approve
          </Button>
        )}

        {(isApproved || isScheduled) && (
          <>
            <Button className="w-full" onClick={onPublishNow} disabled={!!actionLoading || !canPublish}>
              {actionLoading === 'publish' ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Send className="mr-2 size-4" />}
              Publish now
            </Button>
            <Button variant="outline" className="w-full" onClick={onOpenSchedule} disabled={!!actionLoading}>
              <Calendar className="mr-2 size-4" />
              {hasScheduled ? 'Reschedule' : 'Schedule'}
            </Button>
          </>
        )}

        {typeof campaignReRollsRemaining === 'number' && onReRoll && (
          <Button
            variant="outline"
            className="w-full border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-800/40 dark:bg-amber-950/20 dark:text-amber-200"
            onClick={onReRoll}
            disabled={!!actionLoading || campaignReRollsRemaining <= 0}
          >
            {actionLoading === 'reroll' ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
            Re-roll ({campaignReRollsRemaining} left)
          </Button>
        )}

        {hasTemplate && onRemix && (
          <Button
            variant="outline"
            className="w-full border-purple-200 bg-purple-50 text-purple-800 hover:bg-purple-100 dark:border-purple-800/40 dark:bg-purple-950/20 dark:text-purple-200"
            onClick={onRemix}
            disabled={!!actionLoading}
          >
            <Wand2 className="mr-2 size-4" />
            Remix from template
          </Button>
        )}

        {canReject && (
          <Button variant="outline" className="w-full" onClick={onOpenReject} disabled={!!actionLoading}>
            <XCircle className="mr-2 size-4 text-red-500" />
            Reject
          </Button>
        )}

        <Button
          variant="outline"
          className="w-full text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/20"
          onClick={onOpenDelete}
          disabled={!!actionLoading}
        >
          <Trash2 className="mr-2 size-4" />
          Delete
        </Button>
      </div>
    </Card>
  );
}
