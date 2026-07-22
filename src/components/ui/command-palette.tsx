'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Calendar,
  CheckCircle2,
  CircleCheck,
  Clock,
  CornerDownLeft,
  CreditCard,
  ExternalLink,
  FileText,
  Fingerprint,
  Gift,
  History,
  Image,
  LayoutList,
  LifeBuoy,
  Link2,
  Megaphone,
  MessageCircle,
  PenLine,
  Search,
  Settings,
  Sparkles,
  UserRound,
  Users,
  Zap,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Kbd } from '@/components/ui/kbd';
import { fuzzyScore } from '@/lib/fuzzy';
import type { UserRole } from '@/lib/roles';
import { getNavForRole } from '@/lib/roles';
import { cn } from '@/utils/Helpers';

type LucideIcon = typeof Search;

const ICONS: Record<string, LucideIcon> = {
  BarChart3,
  BookOpen,
  Calendar,
  CheckCircle2,
  CircleCheck,
  Clock,
  CreditCard,
  ExternalLink,
  FileText,
  Fingerprint,
  Gift,
  Image,
  LayoutList,
  LifeBuoy,
  Link2,
  Megaphone,
  MessageCircle,
  PenLine,
  Settings,
  Sparkles,
  UserRound,
  Users,
  Zap,
};

type CommandEntry = {
  id: string;
  label: string;
  group: string;
  href: string;
  icon: LucideIcon;
  external?: boolean;
  keywords?: string;
};

const RECENTS_KEY = 'np-cmdk-recents';
const RECENTS_MAX = 5;

function readRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function pushRecent(id: string) {
  try {
    const next = [id, ...readRecents().filter(r => r !== id)].slice(0, RECENTS_MAX);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
}

type CommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: UserRole;
  currentPlan: string;
  isTeam: boolean;
};

export function CommandPalette({ open, onOpenChange, role, currentPlan, isTeam }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  // Build the command index from the same source of truth as the sidebar,
  // so RBAC and plan gating stay enforced in one place.
  const entries = useMemo<CommandEntry[]>(() => {
    const navGroups = getNavForRole(role);
    const pages: CommandEntry[] = [];
    for (const [group, items] of Object.entries(navGroups)) {
      for (const item of items) {
        if (item.planRequired && !item.planRequired.includes(currentPlan)) {
          continue;
        }
        pages.push({
          id: item.href,
          label: item.label,
          group,
          href: item.href,
          icon: ICONS[item.icon] ?? FileText,
          external: item.external,
        });
      }
    }
    const actions: CommandEntry[] = isTeam
      ? [
          { id: 'action:create-post', label: 'Create post', group: 'Actions', href: '/dashboard/content/create', icon: PenLine, keywords: 'new write compose' },
          { id: 'action:blitz', label: 'Start a Blitz', group: 'Actions', href: '/dashboard/blitz', icon: Zap, keywords: 'remix video quick' },
          { id: 'action:ai-studio', label: 'Generate with AI Studio', group: 'Actions', href: '/dashboard/ai-studio', icon: Sparkles, keywords: 'image video ai generate' },
        ]
      : [];
    return [...actions, ...pages];
  }, [role, currentPlan, isTeam]);

  // Reset state each time the palette opens; load recents lazily.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      setRecentIds(readRecents());
    }
  }, [open]);

  const results = useMemo<CommandEntry[]>(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      const byId = new Map(entries.map(e => [e.id, e]));
      const recents = recentIds
        .map(id => byId.get(id))
        .filter((e): e is CommandEntry => !!e)
        .map(e => ({ ...e, group: 'Recent' }));
      const recentSet = new Set(recents.map(r => r.id));
      return [...recents, ...entries.filter(e => !recentSet.has(e.id))];
    }
    return entries
      .map((e) => {
        const score = fuzzyScore(trimmed, e.keywords ? `${e.label} ${e.keywords}` : e.label);
        return score === null ? null : { entry: e, score };
      })
      .filter((r): r is { entry: CommandEntry; score: number } => r !== null)
      .sort((a, b) => b.score - a.score)
      .map(r => r.entry);
  }, [query, entries, recentIds]);

  const clampedIndex = Math.min(activeIndex, Math.max(0, results.length - 1));

  const select = useCallback((entry: CommandEntry) => {
    pushRecent(entry.id);
    onOpenChange(false);
    if (entry.external) {
      window.open(entry.href, '_blank', 'noopener,noreferrer');
    } else {
      router.push(entry.href);
    }
  }, [onOpenChange, router]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => (results.length ? (i + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActiveIndex(Math.max(0, results.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const entry = results[clampedIndex];
      if (entry) {
        select(entry);
      }
    }
  };

  // Keep the active row visible while arrowing through the list.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${clampedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [clampedIndex]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm duration-base data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        />
        {/* Radix focuses the first focusable element on open — the search input,
          * since result rows are tabIndex={-1}. */}
        <DialogPrimitive.Content
          className="fixed left-1/2 top-[18%] z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-elevation-3 duration-base ease-out-quart data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Search pages and actions. Use arrow keys to navigate, Enter to open.
          </DialogPrimitive.Description>

          {/* Search input */}
          <div className="flex items-center gap-2.5 border-b px-4">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              role="combobox"
              aria-expanded="true"
              aria-controls="np-cmdk-list"
              aria-activedescendant={results.length ? `np-cmdk-item-${clampedIndex}` : undefined}
              aria-label="Search pages and actions"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="Search pages and actions…"
              className="h-12 w-full bg-transparent text-body outline-none placeholder:text-muted-foreground"
            />
            <Kbd className="hidden shrink-0 sm:inline-flex">esc</Kbd>
          </div>

          {/* Results */}
          <div
            ref={listRef}
            id="np-cmdk-list"
            role="listbox"
            aria-label="Results"
            className="max-h-[min(50vh,320px)] overflow-y-auto p-1.5"
          >
            {results.length === 0 && (
              <p className="px-3 py-8 text-center text-body text-muted-foreground">
                No results for “
                {query.trim()}
                ”
              </p>
            )}
            {results.map((entry, index) => {
              const Icon = entry.group === 'Recent' ? History : entry.icon;
              const active = index === clampedIndex;
              const showHeader = index === 0 || results[index - 1]!.group !== entry.group;
              return (
                <div key={entry.id}>
                  {showHeader && !query.trim() && (
                    <p className="select-none px-2.5 pb-1 pt-2.5 font-mono text-label uppercase text-muted-foreground/60">
                      {entry.group}
                    </p>
                  )}
                  <button
                    type="button"
                    id={`np-cmdk-item-${index}`}
                    data-index={index}
                    role="option"
                    aria-selected={active}
                    tabIndex={-1}
                    onClick={() => select(entry)}
                    onMouseMove={() => setActiveIndex(index)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-body transition-colors duration-instant',
                      active ? 'bg-primary/10 text-primary' : 'text-foreground',
                    )}
                  >
                    <Icon className={cn('size-4 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} />
                    <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                    {query.trim() && (
                      <span className="shrink-0 text-meta text-muted-foreground/70">{entry.group}</span>
                    )}
                    {entry.external && <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground/50" />}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Footer hints */}
          <div className="flex items-center gap-3 border-t bg-muted/40 px-4 py-2 text-micro text-muted-foreground">
            <span className="flex items-center gap-1">
              <Kbd className="bg-background">↑</Kbd>
              <Kbd className="bg-background">↓</Kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <Kbd className="bg-background">
                <CornerDownLeft className="size-2.5" />
              </Kbd>
              open
            </span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
