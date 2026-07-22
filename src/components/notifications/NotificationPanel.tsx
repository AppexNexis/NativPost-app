'use client';

import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  FileText,
  Loader2,
  Send,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

// -----------------------------------------------------------
// Types
// -----------------------------------------------------------
type NotificationType = 'error' | 'warning' | 'info' | 'success';
type NotificationCategory = 'publish' | 'approval' | 'billing' | 'system' | 'content';

type Notification = {
  id: string;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  body: string;
  actionUrl: string | null;
  actionLabel: string | null;
  isRead: boolean;
  createdAt: string;
};

// -----------------------------------------------------------
// Helpers
// -----------------------------------------------------------
const CATEGORY_ICON: Record<NotificationCategory, typeof Send> = {
  publish: Send,
  approval: CheckCircle2,
  billing: CreditCard,
  system: AlertCircle,
  content: FileText,
};

const TYPE_COLOR: Record<NotificationType, string> = {
  error: 'text-destructive',
  warning: 'text-amber-500',
  info: 'text-blue-500',
  success: 'text-emerald-500',
};

const TYPE_BG: Record<NotificationType, string> = {
  error: 'bg-destructive/10',
  warning: 'bg-amber-50 dark:bg-amber-950/20',
  info: 'bg-blue-50 dark:bg-blue-950/20',
  success: 'bg-emerald-50 dark:bg-emerald-950/20',
};

const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  publish: 'Publishing',
  approval: 'Approvals',
  billing: 'Billing',
  system: 'System',
  content: 'Content',
};

type FilterTab = 'all' | NotificationCategory;
const TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'publish', label: 'Publishing' },
  { key: 'approval', label: 'Approvals' },
  { key: 'billing', label: 'Billing' },
  { key: 'system', label: 'System' },
];

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) {
    return 'Just now';
  }
  if (mins < 60) {
    return `${mins}m ago`;
  }
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) {
    return `${hrs}h ago`;
  }
  const days = Math.floor(hrs / 24);
  if (days === 1) {
    return 'Yesterday';
  }
  if (days < 7) {
    return `${days}d ago`;
  }
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function groupByDate(notifications: Notification[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const groups: { label: string; items: Notification[] }[] = [
    { label: 'Today', items: [] },
    { label: 'This week', items: [] },
    { label: 'Earlier', items: [] },
  ];

  for (const n of notifications) {
    const d = new Date(n.createdAt);
    if (d >= today) {
      groups[0]!.items.push(n);
    } else if (d >= weekAgo) {
      groups[1]!.items.push(n);
    } else {
      groups[2]!.items.push(n);
    }
  }

  return groups.filter(g => g.items.length > 0);
}

// -----------------------------------------------------------
// Component
// -----------------------------------------------------------
type NotificationPanelProps = {
  onClose: () => void;
  onAllRead: () => void;
};

export function NotificationPanel({ onClose, onAllRead }: NotificationPanelProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [markingAll, setMarkingAll] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/notifications');
        if (res.ok) {
          const data = await res.json() as { notifications: Notification[] };
          setNotifications(data.notifications);
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const markRead = async (id: string) => {
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, isRead: true } : n),
    );
    await fetch('/api/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
  };

  const markAllRead = async () => {
    setMarkingAll(true);
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    onAllRead();
    await fetch('/api/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    setMarkingAll(false);
  };

  const filtered = activeTab === 'all'
    ? notifications
    : notifications.filter(n => n.category === activeTab);

  const unreadCount = notifications.filter(n => !n.isRead).length;
  const groups = groupByDate(filtered);

  return (
    <div
      className="absolute right-0 top-10 z-50 flex w-[380px] flex-col rounded-xl border bg-background shadow-lg max-sm:fixed max-sm:inset-x-3 max-sm:top-14 max-sm:w-auto"
      style={{ maxHeight: 'min(520px, calc(100vh - 80px))' }}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Notifications</span>
          {unreadCount > 0 && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-micro font-semibold text-primary-foreground">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              disabled={markingAll}
              className="text-[12px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              Mark all read
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="scrollbar-none flex shrink-0 gap-0.5 overflow-x-auto border-b px-3 py-2">
        {TABS.map(tab => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`whitespace-nowrap rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <div className="rounded-full bg-muted p-3">
              <CheckCircle2 className="size-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">Nothing to catch up on</p>
            <p className="text-meta text-muted-foreground">
              {activeTab === 'all'
                ? 'All notifications will appear here.'
                : `No ${CATEGORY_LABELS[activeTab as NotificationCategory] || activeTab} notifications.`}
            </p>
          </div>
        ) : (
          <div className="py-2">
            {groups.map(group => (
              <div key={group.label}>
                <p className="px-4 py-2 text-micro font-medium uppercase tracking-wider text-muted-foreground/60">
                  {group.label}
                </p>
                {group.items.map((n) => {
                  const Icon = CATEGORY_ICON[n.category] ?? AlertCircle;
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => !n.isRead && markRead(n.id)}
                      className={`group w-full px-4 py-3 text-left transition-colors hover:bg-muted/50 ${
                        !n.isRead ? 'bg-muted/20' : ''
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Icon */}
                        <div className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full ${TYPE_BG[n.type]}`}>
                          <Icon className={`size-3.5 ${TYPE_COLOR[n.type]}`} />
                        </div>

                        {/* Content */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className={`text-ui font-medium leading-snug ${!n.isRead ? 'text-foreground' : 'text-muted-foreground'}`}>
                              {n.title}
                            </p>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <span className="text-micro text-muted-foreground">
                                {formatRelativeTime(n.createdAt)}
                              </span>
                              {!n.isRead && (
                                <span className="size-1.5 rounded-full bg-primary" />
                              )}
                            </div>
                          </div>
                          <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
                            {n.body}
                          </p>
                          {n.actionUrl && n.actionLabel && (
                            <Link
                              href={n.actionUrl}
                              onClick={onClose}
                              className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline"
                            >
                              {n.actionLabel}
                              <ExternalLink className="size-3" />
                            </Link>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
