'use client';

import { Bell } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { NotificationPanel } from './NotificationPanel';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const fetchCount = async () => {
    try {
      const res = await fetch('/api/notifications?countOnly=true');
      if (res.ok) {
        const data = await res.json() as { unread: number };
        setUnreadCount(data.unread);
      }
    } catch {
      // Network errors are silent — the bell just shows no badge
    }
  };

  // Poll every 60 seconds
  useEffect(() => {
    fetchCount();
    const id = setInterval(fetchCount, 60_000);
    return () => clearInterval(id);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleOpen = () => {
    setOpen(o => !o);
  };

  const handleAllRead = () => {
    setUnreadCount(0);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={handleOpen}
        aria-label="Notifications"
        className="relative rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Bell className="size-5" />
        {unreadCount > 0 && (
          <span
            className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-destructive-foreground"
            aria-label={`${unreadCount} unread notifications`}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <NotificationPanel
          onClose={() => setOpen(false)}
          onAllRead={handleAllRead}
        />
      )}
    </div>
  );
}
