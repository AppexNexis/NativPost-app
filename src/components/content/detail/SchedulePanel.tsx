'use client';

import { CalendarClock, Check, Loader2, Send } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type Props = {
  scheduledFor: string | null;
  onSchedule: (iso: string) => Promise<void> | void;
  onPublishNow: () => Promise<void> | void;
  isBusy?: boolean;
  showPublishNow?: boolean;
};

export function SchedulePanel({ scheduledFor, onSchedule, onPublishNow, isBusy = false, showPublishNow = true }: Props) {
  const initialDate = scheduledFor ? new Date(scheduledFor) : null;
  const [date, setDate] = useState(initialDate ? initialDate.toISOString().split('T')[0]! : '');
  const [time, setTime] = useState(initialDate
    ? `${String(initialDate.getHours()).padStart(2, '0')}:${String(initialDate.getMinutes()).padStart(2, '0')}`
    : '09:00');
  const [editing, setEditing] = useState(false);

  const commit = async () => {
    if (!date) return;
    const iso = new Date(`${date}T${time || '09:00'}:00`).toISOString();
    await onSchedule(iso);
    setEditing(false);
  };

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <CalendarClock className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Schedule</h3>
      </div>

      {scheduledFor && !editing && (
        <div className="mb-3 rounded-lg border bg-violet-50 px-3 py-2.5 dark:bg-violet-950/20">
          <p className="text-[10px] font-medium uppercase tracking-wide text-violet-700 dark:text-violet-400">Scheduled for</p>
          <p className="mt-0.5 text-sm font-semibold text-violet-900 dark:text-violet-200">
            {new Date(scheduledFor).toLocaleString(undefined, {
              weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
            })}
          </p>
        </div>
      )}

      {editing || !scheduledFor
        ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Date</label>
                  <input
                    type="date"
                    value={date}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={e => setDate(e.target.value)}
                    className="h-9 w-full rounded-md border bg-background px-2 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Time</label>
                  <input
                    type="time"
                    value={time}
                    onChange={e => setTime(e.target.value)}
                    className="h-9 w-full rounded-md border bg-background px-2 text-xs"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={commit} disabled={!date || isBusy} className="flex-1">
                  {isBusy ? <Loader2 className="mr-1.5 size-3 animate-spin" /> : <Check className="mr-1.5 size-3" />}
                  {scheduledFor ? 'Reschedule' : 'Confirm'}
                </Button>
                {editing && (
                  <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                )}
              </div>
            </div>
          )
        : (
            <div className="flex flex-col gap-2">
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Reschedule</Button>
              {showPublishNow && (
                <Button size="sm" onClick={onPublishNow} disabled={isBusy}>
                  {isBusy ? <Loader2 className="mr-1.5 size-3 animate-spin" /> : <Send className="mr-1.5 size-3" />}
                  Publish now
                </Button>
              )}
            </div>
          )}
    </Card>
  );
}
