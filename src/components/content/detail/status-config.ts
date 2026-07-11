import type { LucideIcon } from 'lucide-react';
import {
  Archive,
  CheckCircle2,
  Clock,
  FileText,
  PauseCircle,
  Send,
  XCircle,
} from 'lucide-react';

// Shared status / mode config so the detail panels all agree on labels + colors.
// Matches PostTableView colors so posts list ↔ detail feel like one system.

export type StatusKey =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'scheduled'
  | 'published'
  | 'rejected'
  | 'archived'
  | string;

export type StatusMeta = {
  label: string;
  bg: string;
  dot: string;
  ring: string;
  icon: LucideIcon;
};

export const STATUS_CONFIG: Record<string, StatusMeta> = {
  draft: {
    label: 'Draft',
    bg: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-700/50 dark:text-zinc-300',
    dot: 'bg-zinc-400',
    ring: 'ring-zinc-200 dark:ring-zinc-700/40',
    icon: FileText,
  },
  pending_review: {
    label: 'Pending review',
    bg: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300',
    dot: 'bg-amber-400',
    ring: 'ring-amber-200 dark:ring-amber-700/40',
    icon: Clock,
  },
  approved: {
    label: 'Approved',
    bg: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300',
    dot: 'bg-blue-500',
    ring: 'ring-blue-200 dark:ring-blue-700/40',
    icon: CheckCircle2,
  },
  scheduled: {
    label: 'Scheduled',
    bg: 'bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-300',
    dot: 'bg-violet-500',
    ring: 'ring-violet-200 dark:ring-violet-700/40',
    icon: Clock,
  },
  published: {
    label: 'Published',
    bg: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300',
    dot: 'bg-emerald-500',
    ring: 'ring-emerald-200 dark:ring-emerald-700/40',
    icon: Send,
  },
  rejected: {
    label: 'Rejected',
    bg: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300',
    dot: 'bg-red-500',
    ring: 'ring-red-200 dark:ring-red-700/40',
    icon: XCircle,
  },
  archived: {
    label: 'Archived',
    bg: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800/40 dark:text-zinc-400',
    dot: 'bg-zinc-500',
    ring: 'ring-zinc-200 dark:ring-zinc-700/40',
    icon: Archive,
  },
};

export function getStatusMeta(status: string | null | undefined): StatusMeta {
  if (!status) return STATUS_CONFIG.draft!;
  return STATUS_CONFIG[status] ?? {
    label: status.replace(/_/g, ' '),
    bg: 'bg-muted text-muted-foreground',
    dot: 'bg-muted-foreground/60',
    ring: 'ring-border',
    icon: PauseCircle,
  };
}

export const MODE_CONFIG: Record<string, { label: string; bg: string }> = {
  normal: { label: 'Normal', bg: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-700/50 dark:text-zinc-300' },
  concise: { label: 'Concise', bg: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300' },
  controversial: { label: 'Controversial', bg: 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300' },
};

export const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  linkedin_page: 'LinkedIn Page',
  twitter: 'X (Twitter)',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  threads: 'Threads',
  pinterest: 'Pinterest',
  snapchat: 'Snapchat',
  whatsapp: 'WhatsApp',
};

export const ASPECT_RATIO_LABELS: Record<string, string> = {
  '9:16': '9:16 Vertical (Stories, Reels)',
  '1:1': '1:1 Square (Feed)',
  '16:9': '16:9 Landscape (YouTube, LinkedIn)',
  '4:3': '4:3 Standard',
  '3:4': '3:4 Portrait',
  '2:3': '2:3 Tall',
  '3:2': '3:2 Wide',
  '21:9': '21:9 Cinematic',
};

export function ctLabel(contentType: string | null | undefined): string {
  if (!contentType) return '-';
  return contentType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '-';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

export function formatCount(n: number | null | undefined): string {
  if (n == null) return '-';
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}
