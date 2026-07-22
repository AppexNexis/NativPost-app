'use client';

import { AlertTriangle, CalendarClock, CheckCircle2, Trash2, X, XCircle } from 'lucide-react';
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/utils/Helpers';

type Props = {
  selectedCount: number;
  onApprove: () => Promise<void> | void;
  onReject: (feedback: string) => Promise<void> | void;
  onSchedule: (scheduledFor: string) => Promise<void> | void;
  onDelete: () => Promise<void> | void;
  onClear: () => void;
  isBusy?: boolean;
};

export function BulkActionBar({
  selectedCount,
  onApprove,
  onReject,
  onSchedule,
  onDelete,
  onClear,
  isBusy = false,
}: Props) {
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [rejectFeedback, setRejectFeedback] = useState('');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('09:00');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const visible = selectedCount > 0;

  const handleReject = async () => {
    await onReject(rejectFeedback);
    setRejectFeedback('');
    setRejectOpen(false);
  };

  const handleSchedule = async () => {
    if (!scheduleDate) {
      return;
    }
    const iso = new Date(`${scheduleDate}T${scheduleTime || '09:00'}:00`).toISOString();
    await onSchedule(iso);
    setScheduleDate('');
    setScheduleTime('09:00');
    setScheduleOpen(false);
  };

  const handleConfirmDelete = async () => {
    await onDelete();
    setConfirmDeleteOpen(false);
  };

  return (
    <>
      <div
        className={cn(
          'pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 transition-all duration-200',
          visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-6 opacity-0',
        )}
      >
        <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-full border bg-card/95 px-3 py-2 shadow-lg backdrop-blur-md sm:gap-3">
          <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
            {selectedCount}
            {' '}
            selected
          </span>

          {/* Approve */}
          <Button
            size="sm"
            variant="outline"
            disabled={isBusy}
            onClick={() => onApprove()}
            className="h-8 gap-1.5"
          >
            <CheckCircle2 className="size-3.5 text-emerald-500" />
            <span className="hidden sm:inline">Approve</span>
          </Button>

          {/* Reject */}
          <Popover open={rejectOpen} onOpenChange={setRejectOpen}>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" disabled={isBusy} className="h-8 gap-1.5">
                <XCircle className="size-3.5 text-red-500" />
                <span className="hidden sm:inline">Reject</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="center" side="top">
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium">
                    Reject
                    {selectedCount}
                    {' '}
                    posts
                  </p>
                  <p className="mt-0.5 text-meta text-muted-foreground">
                    Optional feedback signal for the engine.
                  </p>
                </div>
                <Textarea
                  value={rejectFeedback}
                  onChange={e => setRejectFeedback(e.target.value)}
                  placeholder="Why are these being rejected?"
                  className="min-h-[80px] text-sm"
                />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setRejectOpen(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleReject} disabled={isBusy}>
                    Reject
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Schedule */}
          <Popover open={scheduleOpen} onOpenChange={setScheduleOpen}>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" disabled={isBusy} className="h-8 gap-1.5">
                <CalendarClock className="size-3.5 text-blue-500" />
                <span className="hidden sm:inline">Schedule</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72" align="center" side="top">
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium">
                    Schedule
                    {selectedCount}
                    {' '}
                    posts
                  </p>
                  <p className="mt-0.5 text-meta text-muted-foreground">
                    All selected posts will be scheduled for this time.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-micro font-medium text-muted-foreground">Date</label>
                    <input
                      type="date"
                      value={scheduleDate}
                      onChange={e => setScheduleDate(e.target.value)}
                      className="w-full rounded-md border bg-background px-2 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-micro font-medium text-muted-foreground">Time</label>
                    <input
                      type="time"
                      value={scheduleTime}
                      onChange={e => setScheduleTime(e.target.value)}
                      className="w-full rounded-md border bg-background px-2 py-1.5 text-xs"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setScheduleOpen(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleSchedule} disabled={!scheduleDate || isBusy}>
                    Schedule
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Delete */}
          <Button
            size="sm"
            variant="outline"
            disabled={isBusy}
            onClick={() => setConfirmDeleteOpen(true)}
            className="h-8 gap-1.5"
          >
            <Trash2 className="size-3.5 text-red-500" />
            <span className="hidden sm:inline">Delete</span>
          </Button>

          {/* Clear */}
          <button
            type="button"
            onClick={onClear}
            className="ml-1 inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
            aria-label="Clear selection"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Delete confirmation */}
      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-red-500" />
              Delete
              {' '}
              {selectedCount}
              {' '}
              posts?
            </DialogTitle>
            <DialogDescription>
              This action cannot be undone. The selected posts will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={isBusy}
            >
              Delete
              {' '}
              {selectedCount}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
