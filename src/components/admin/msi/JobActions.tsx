'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

type Task = { id: string; taskType: string; status: string; sequence: number };

const slug = (s: string) => s.replace(/_/g, ' ');

// Operator / QA actions on a job, rendered into the (server) job board.
export function JobActions({
  jobId,
  jobState,
  tasks,
}: {
  jobId: string;
  jobState: string;
  tasks: Task[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const post = async (url: string, body: unknown, key: string) => {
    setBusy(key);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || `Server returned ${res.status}`);
      }
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  };

  if (jobState === 'in_progress') {
    const pending = tasks.filter(t => t.status !== 'done');
    if (pending.length === 0) {
      return null;
    }
    return (
      <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
        {pending.map(t => (
          <Button
            key={t.id}
            size="sm"
            variant="outline"
            disabled={busy !== null}
            onClick={() =>
              post(`/api/admin/msi/jobs/${jobId}/complete-task`, { taskId: t.id }, t.id)}
          >
            {busy === t.id ? 'Saving…' : `Mark done: ${slug(t.taskType)}`}
          </Button>
        ))}
      </div>
    );
  }

  if (jobState === 'peer_review' || jobState === 'qa') {
    return (
      <div className="mt-3 flex gap-2 border-t border-border pt-3">
        <Button
          size="sm"
          disabled={busy !== null}
          onClick={() =>
            post(`/api/admin/msi/jobs/${jobId}/review`, { action: 'approve' }, 'approve')}
        >
          {busy === 'approve' ? '…' : 'Approve'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy !== null}
          onClick={() =>
            post(`/api/admin/msi/jobs/${jobId}/review`, { action: 'reject' }, 'reject')}
        >
          Reject
        </Button>
      </div>
    );
  }

  return null;
}
