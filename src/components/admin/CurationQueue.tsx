'use client';

import type {
  Column,
  ColumnDef,
  ColumnFiltersState,
  RowData,
  SortingState,
  VisibilityState,
} from '@tanstack/react-table';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import {
  AlertTriangle,
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronUp,
  Clock,
  Copy,
  Filter,
  Globe,
  Loader2,
  Play,
  Search,
  SlidersHorizontal,
  ThumbsDown,
  ThumbsUp,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { AdminLayout } from '@/components/admin/AdminLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { getOptimizedVideoUrl, getVideoPosterUrl, isCloudinaryVideoUrl } from '@/lib/cloudinary';
import type { ContentTemplate } from '@/types/v2';
import { formatDuration, formatLabel } from '@/utils/format';

declare module '@tanstack/react-table' {
  // eslint-disable-next-line unused-imports/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    className?: string;
  }
}

/* ─────────────────── Brand Icons ─────────────────── */

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

function YoutubeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17z" />
      <polygon points="10 15 15 12 10 9 10 15" />
    </svg>
  );
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M16.6 5.82c-.9-.6-1.55-1.49-1.78-2.52h-3.04v13.1c0 1.4-1.13 2.54-2.53 2.54a2.54 2.54 0 0 1-2.53-2.54c0-1.4 1.13-2.53 2.53-2.53.27 0 .53.04.77.11v-3.1a5.6 5.6 0 0 0-.77-.05A5.62 5.62 0 0 0 3.7 16.4a5.62 5.62 0 0 0 5.62 5.62 5.62 5.62 0 0 0 5.62-5.62V9.4a7.34 7.34 0 0 0 4.26 1.36V7.7a4.85 4.85 0 0 1-2.6-1.88z" />
    </svg>
  );
}

/* ─────────────────── Types ─────────────────── */

type Platform = 'TikTok' | 'Instagram' | 'YouTube' | 'Pexels' | 'Unknown';
type CurationStatus = 'pending' | 'approved' | 'rejected';

type Template = {
  id: string;
  sourceUrl: string;
  sourcePlatform: Platform;
  contentType: string;
  thumbnailUrl: string;
  mediaUrl: string | null;
  creatorName: string;
  niches: string[];
  angles: string[];
  engagementScore: number | null;
  duration: number;
  status: CurationStatus;
  createdAt: string;
  updatedAt: string;
  transcript: string;
  structure: {
    hook: { text: string; time: number } | null;
    body: { text: string; time: number } | null;
    cta: { text: string; time: number } | null;
  };
  rejectionCount: number;
  duplicateOf: string | null;
};

/* ─────────────────── Helpers ─────────────────── */

function mapDbTemplate(item: ContentTemplate): Template {
  const structure = item.structure || {};
  return {
    id: item.id,
    sourceUrl: item.sourceUrl,
    sourcePlatform: mapPlatform(item.sourcePlatform),
    contentType: formatLabel(item.contentType),
    thumbnailUrl: item.thumbnailUrl,
    mediaUrl: item.mediaUrl,
    creatorName: item.sourceCreator ? `@${item.sourceCreator}` : 'Unknown creator',
    niches: item.niches.map(n => formatLabel(n)),
    angles: item.angles,
    engagementScore: item.engagementScore,
    duration: item.durationSeconds ?? 0,
    status: item.curationStatus as CurationStatus,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    transcript: extractTranscript(structure),
    structure: {
      hook: structure.hook ? { text: structure.hook.text, time: structure.hook.duration } : null,
      body: structure.body ? { text: structure.body.text, time: structure.body.duration } : null,
      cta: structure.cta ? { text: structure.cta.text, time: structure.cta.duration } : null,
    },
    rejectionCount: 0,
    duplicateOf: null,
  };
}

function mapPlatform(platform: string): Platform {
  switch (platform) {
    case 'tiktok': return 'TikTok';
    case 'instagram': return 'Instagram';
    case 'youtube': return 'YouTube';
    case 'pexels': return 'Pexels';
    default: return 'Unknown';
  }
}

function extractTranscript(structure: ContentTemplate['structure']): string {
  const parts: string[] = [];
  if (structure.hook?.text) {
    parts.push(structure.hook.text);
  }
  if (structure.body?.text) {
    parts.push(structure.body.text);
  }
  if (structure.cta?.text) {
    parts.push(structure.cta.text);
  }
  return parts.join(' ') || 'No transcript available.';
}

const PlatformIcon = ({ platform }: { platform: Platform }) => {
  switch (platform) {
    case 'TikTok':
      return <TikTokIcon className="size-4" />;
    case 'Instagram':
      return <InstagramIcon className="size-4" />;
    case 'YouTube':
      return <YoutubeIcon className="size-4" />;
    default:
      return <Globe className="size-4 text-muted-foreground" />;
  }
};

const ContentBadge = ({ type }: { type: string }) => {
  return (
    <Badge variant="outline" className="bg-secondary/50 text-secondary-foreground">
      {type}
    </Badge>
  );
};

function SortButton<TData, TValue>({
  column,
  label,
}: {
  column: Column<TData, TValue>;
  label: string;
}) {
  const sorted = column.getIsSorted();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => column.toggleSorting(sorted === 'asc')}
      className="-ml-2 h-7 px-2 text-xs font-medium hover:bg-accent"
    >
      {label}
      {sorted === 'asc'
        ? <ChevronUp className="ml-1 size-3" />
        : sorted === 'desc'
          ? <ChevronDown className="ml-1 size-3" />
          : <ArrowUpDown className="ml-1 size-3 opacity-50" />}
    </Button>
  );
}

const SuggestionBanner = ({ template }: { template: Template }) => {
  if (template.engagementScore && template.engagementScore >= 0.9) {
    return (
      <div className="mt-2 flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-900/20 dark:text-green-300">
        <Zap className="size-4" />
        High engagement score (
        {Math.round(template.engagementScore * 100)}
        ) → Auto-suggest Approve
      </div>
    );
  }
  if (template.rejectionCount >= 3) {
    return (
      <div className="mt-2 flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
        <AlertTriangle className="size-4" />
        Creator has
        {' '}
        {template.rejectionCount}
        {' '}
        rejections → Flag for review
      </div>
    );
  }
  if (template.duplicateOf) {
    return (
      <div className="mt-2 flex items-center gap-2 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
        <Copy className="size-4" />
        Duplicate content detected → Similar to template #
        {template.duplicateOf}
      </div>
    );
  }
  return null;
};

/* ─────────────────── Main Component ─────────────────── */

export default function CurationQueue() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [drawerTemplate, setDrawerTemplate] = useState<Template | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPlatform, setFilterPlatform] = useState<'all' | Platform>('all');
  const [filterType, setFilterType] = useState<'all' | string>('all');
  const [filterNiche, setFilterNiche] = useState<string>('all');
  const [rejectFeedback, setRejectFeedback] = useState('');
  const [editNiches, setEditNiches] = useState<string[]>([]);
  const [editAngles, setEditAngles] = useState<string[]>([]);
  const [newNiche, setNewNiche] = useState('');
  const [newAngle, setNewAngle] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const [pendingTotal, setPendingTotal] = useState<number | null>(null);

  const loadTemplates = async () => {
    setLoading(true);
    setError(null);
    try {
      const pageSize = 500;
      const collected: ContentTemplate[] = [];
      let offset = 0;
      let total = 0;

      // Paginate through all pending items so no platform is hidden
      // beyond the first page (previously capped at 100).
      for (let page = 0; page < 20; page++) {
        const res = await fetch(
          `/api/templates/admin?status=pending&limit=${pageSize}&offset=${offset}`,
        );
        if (!res.ok) {
          throw new Error('Failed to load queue');
        }
        const data = await res.json();
        const items = (data.items ?? []) as ContentTemplate[];
        collected.push(...items);
        total = Number(data.total ?? collected.length);
        offset += items.length;
        if (items.length < pageSize || collected.length >= total) {
          break;
        }
      }

      setPendingTotal(total);
      setTemplates(collected.map(mapDbTemplate));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load queue');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const allNiches = useMemo(() => {
    const set = new Set<string>();
    templates.forEach(t => t.niches.forEach(n => set.add(n)));
    return Array.from(set).sort();
  }, [templates]);

  const allTypes = useMemo(() => {
    const set = new Set<string>();
    templates.forEach(t => set.add(t.contentType));
    return Array.from(set).sort();
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    let result = templates.filter(t => t.status === 'pending');
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        t =>
          t.creatorName.toLowerCase().includes(q)
          || t.sourceUrl.toLowerCase().includes(q),
      );
    }
    if (filterPlatform !== 'all') {
      result = result.filter(t => t.sourcePlatform === filterPlatform);
    }
    if (filterType !== 'all') {
      result = result.filter(t => t.contentType === filterType);
    }
    if (filterNiche !== 'all') {
      result = result.filter(t => t.niches.includes(filterNiche));
    }
    return result;
  }, [templates, searchQuery, filterPlatform, filterType, filterNiche]);

  /* ─────────── TanStack table ─────────── */
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'createdAt', desc: true },
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    // hide heavy/redundant columns on first load — user can toggle back on
    angles: false,
    niches: false,
    duration: false,
    createdAt: false,
    sourcePlatform: false, // platform icon already shown in preview + creator cells
  });
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 25 });

  const columns = useMemo<ColumnDef<Template>[]>(() => [
    {
      id: 'select',
      size: 36,
      enableHiding: false,
      enableSorting: false,
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected()
              ? true
              : table.getIsSomePageRowsSelected()
                ? 'indeterminate'
                : false
          }
          onCheckedChange={value => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={value => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
    },
    {
      id: 'preview',
      size: 56,
      enableHiding: false,
      enableSorting: false,
      header: () => <span>Preview</span>,
      cell: ({ row }) => {
        const template = row.original;
        return (
          <button
            type="button"
            onClick={() => setPreviewTemplate(template)}
            className="relative block size-10 overflow-hidden rounded-md"
            aria-label="Open preview"
          >
            <PreviewThumbnail template={template} />
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition hover:opacity-100">
              <Play className="size-3.5 text-white" />
            </div>
          </button>
        );
      },
    },
    {
      id: 'sourcePlatform',
      accessorKey: 'sourcePlatform',
      size: 100,
      header: ({ column }) => (
        <SortButton column={column} label="Platform" />
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5 min-w-0">
          <PlatformIcon platform={row.original.sourcePlatform} />
          <span className="truncate text-sm">{row.original.sourcePlatform}</span>
        </div>
      ),
    },
    {
      id: 'creator',
      accessorKey: 'creatorName',
      header: ({ column }) => <SortButton column={column} label="Creator" />,
      cell: ({ row }) => {
        const t = row.original;
        return (
          <div className="flex min-w-0 items-center gap-2">
            <PlatformIcon platform={t.sourcePlatform} />
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => openDrawer(t)}
                className="block w-full truncate text-left text-sm font-medium text-primary hover:underline"
                title={t.creatorName}
              >
                {t.creatorName}
              </button>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="truncate">{new Date(t.createdAt).toLocaleDateString()}</span>
                <span>·</span>
                <span className="tabular-nums">{formatDuration(t.duration)}</span>
              </div>
            </div>
          </div>
        );
      },
    },
    {
      id: 'contentType',
      accessorKey: 'contentType',
      size: 120,
      meta: { className: 'hidden md:table-cell' },
      header: ({ column }) => <SortButton column={column} label="Type" />,
      cell: ({ row }) => <ContentBadge type={row.original.contentType} />,
    },
    {
      id: 'niches',
      size: 160,
      enableSorting: false,
      meta: { className: 'hidden xl:table-cell' },
      header: () => <span>Niches</span>,
      cell: ({ row }) => (
        <div className="flex max-w-full flex-wrap gap-1 overflow-hidden">
          {row.original.niches.slice(0, 2).map(n => (
            <Badge key={n} variant="secondary" className="text-xs">
              {n}
            </Badge>
          ))}
          {row.original.niches.length > 2 && (
            <Badge variant="outline" className="text-xs">
              +
              {row.original.niches.length - 2}
            </Badge>
          )}
        </div>
      ),
    },
    {
      id: 'angles',
      size: 160,
      enableSorting: false,
      meta: { className: 'hidden xl:table-cell' },
      header: () => <span>Angles</span>,
      cell: ({ row }) => (
        <div className="flex max-w-full flex-wrap gap-1 overflow-hidden">
          {row.original.angles.slice(0, 2).map(a => (
            <Badge key={a} variant="outline" className="text-xs">
              {a}
            </Badge>
          ))}
          {row.original.angles.length > 2 && (
            <Badge variant="outline" className="text-xs">
              +
              {row.original.angles.length - 2}
            </Badge>
          )}
        </div>
      ),
    },
    {
      id: 'engagementScore',
      accessorFn: row => row.engagementScore ?? -1,
      size: 100,
      meta: { className: 'hidden lg:table-cell' },
      header: ({ column }) => <SortButton column={column} label="Score" />,
      cell: ({ row }) => (
        row.original.engagementScore
          ? (
              <div className="flex items-center gap-1">
                <TrendingUp className="size-3 text-green-600" />
                <span className="text-sm font-medium">{Math.round(row.original.engagementScore * 100)}</span>
              </div>
            )
          : <span className="text-muted-foreground">—</span>
      ),
    },
    {
      id: 'duration',
      accessorKey: 'duration',
      size: 80,
      meta: { className: 'hidden xl:table-cell' },
      header: ({ column }) => <SortButton column={column} label="Duration" />,
      cell: ({ row }) => (
        <span className="text-sm tabular-nums">{formatDuration(row.original.duration)}</span>
      ),
    },
    {
      id: 'createdAt',
      accessorFn: row => new Date(row.createdAt).getTime(),
      size: 100,
      meta: { className: 'hidden xl:table-cell' },
      header: ({ column }) => <SortButton column={column} label="Created" />,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground tabular-nums">
          {new Date(row.original.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      id: 'actions',
      size: 88,
      enableHiding: false,
      enableSorting: false,
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="size-7 text-green-600 hover:bg-green-50 hover:text-green-700"
            disabled={isLoading}
            onClick={() => updateStatus([row.original.id], 'approved')}
            aria-label="Approve"
          >
            <Check className="size-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-7 text-red-600 hover:bg-red-50 hover:text-red-700"
            disabled={isLoading}
            onClick={() => updateStatus([row.original.id], 'rejected')}
            aria-label="Reject"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [isLoading]);

  const table = useReactTable({
    data: filteredTemplates,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      pagination,
    },
    getRowId: row => row.id,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    enableRowSelection: true,
  });

  // Keep the legacy selectedIds Set in sync with tanstack row selection so the
  // bulk-action bar and updateStatus() paths stay unchanged.
  useEffect(() => {
    setSelectedIds(new Set(Object.keys(rowSelection).filter(id => rowSelection[id])));
  }, [rowSelection]);

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const approvedToday = templates.filter(
      t => t.status === 'approved' && t.updatedAt.startsWith(today),
    ).length;
    const rejectedToday = templates.filter(
      t => t.status === 'rejected' && t.updatedAt.startsWith(today),
    ).length;
    const pending = pendingTotal ?? templates.filter(t => t.status === 'pending').length;
    const pendingByPlatform = templates.reduce<Record<Platform, number>>(
      (acc, t) => {
        if (t.status === 'pending') {
          acc[t.sourcePlatform] = (acc[t.sourcePlatform] ?? 0) + 1;
        }
        return acc;
      },
      { TikTok: 0, Instagram: 0, YouTube: 0, Pexels: 0, Unknown: 0 },
    );
    return { pending, approvedToday, rejectedToday, pendingByPlatform };
  }, [templates, pendingTotal]);

  const updateStatus = async (ids: string[], status: CurationStatus) => {
    setIsLoading(true);
    try {
      if (ids.length === 1) {
        const res = await fetch(`/api/templates/${ids[0]}/curate`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        });
        if (!res.ok) {
          throw new Error('Failed to update status');
        }
      } else {
        const action = status === 'approved' ? 'approve' : 'reject';
        const res = await fetch('/api/templates/admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, ids }),
        });
        if (!res.ok) {
          throw new Error('Failed to update status');
        }
      }

      setTemplates(prev =>
        prev.map(t =>
          ids.includes(t.id)
            ? { ...t, status, updatedAt: new Date().toISOString() }
            : t,
        ),
      );
      setSelectedIds(new Set());
      if (drawerTemplate && ids.includes(drawerTemplate.id)) {
        setDrawerTemplate(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setIsLoading(false);
    }
  };

  const openDrawer = (t: Template) => {
    setDrawerTemplate(t);
    setEditNiches([...t.niches]);
    setEditAngles([...t.angles]);
    setRejectFeedback('');
  };

  const addTag = (
    val: string,
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    inputSetter: React.Dispatch<React.SetStateAction<string>>,
  ) => {
    const trimmed = val.trim();
    if (!trimmed) {
      return;
    }
    setter(prev => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
    inputSetter('');
  };

  const removeTag = (
    tag: string,
    setter: React.Dispatch<React.SetStateAction<string[]>>,
  ) => {
    setter(prev => prev.filter(t => t !== tag));
  };

  const handleApproveWithEdits = async () => {
    if (!drawerTemplate) {
      return;
    }
    await updateStatus([drawerTemplate.id], 'approved');
  };

  const handleRejectWithFeedback = async () => {
    if (!drawerTemplate) {
      return;
    }
    await updateStatus([drawerTemplate.id], 'rejected');
    // In a real app, send feedback to API
    console.log('Reject feedback:', rejectFeedback);
  };

  /* ─────────────────── Render ─────────────────── */

  return (
    <AdminLayout>
      <div className="min-w-0 space-y-6">
        {/* Header Stats */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
              <Clock className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pending}</div>
              <p className="text-xs text-muted-foreground">In queue</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {(['TikTok', 'Instagram', 'YouTube', 'Pexels'] as Platform[]).map((p) => {
                  const count = stats.pendingByPlatform[p] ?? 0;
                  if (count === 0) {
                    return null;
                  }
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setFilterPlatform(filterPlatform === p ? 'all' : p)}
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] transition ${
                        filterPlatform === p
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      <PlatformIcon platform={p} />
                      {p}
                      {' '}
                      <span className="font-semibold">{count}</span>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Approved Today</CardTitle>
              <ThumbsUp className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.approvedToday}</div>
              <p className="text-xs text-muted-foreground">Published</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Rejected Today</CardTitle>
              <ThumbsDown className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.rejectedToday}</div>
              <p className="text-xs text-muted-foreground">Declined</p>
            </CardContent>
          </Card>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="size-4" />
            {error}
            <Button variant="outline" size="sm" className="ml-auto" onClick={loadTemplates}>
              Retry
            </Button>
          </div>
        )}

        {/* Filters & Search */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                  placeholder="Search by creator or source URL..."
                  className="pl-8"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Select
                  value={filterPlatform}
                  onValueChange={v => setFilterPlatform(v as Platform | 'all')}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Platform" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Platforms</SelectItem>
                    <SelectItem value="TikTok">TikTok</SelectItem>
                    <SelectItem value="Instagram">Instagram</SelectItem>
                    <SelectItem value="YouTube">YouTube</SelectItem>
                    <SelectItem value="Pexels">Pexels</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={filterType}
                  onValueChange={v => setFilterType(v as string | 'all')}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Content Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {allTypes.map(type => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterNiche} onValueChange={setFilterNiche}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Niche" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Niches</SelectItem>
                    {allNiches.map(n => (
                      <SelectItem key={n} value={n}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setFilterPlatform('all');
                    setFilterType('all');
                    setFilterNiche('all');
                    setSearchQuery('');
                  }}
                >
                  <Filter className="mr-1 size-3" />
                  Reset
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bulk Actions */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-4 py-2">
            <span className="text-sm font-medium">
              {selectedIds.size}
              {' '}
              selected
            </span>
            <Button
              size="sm"
              variant="default"
              disabled={isLoading}
              onClick={() => updateStatus(Array.from(selectedIds), 'approved')}
            >
              <Check className="mr-1 size-3" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={isLoading}
              onClick={() => updateStatus(Array.from(selectedIds), 'rejected')}
            >
              <X className="mr-1 size-3" />
              Reject
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isLoading}
              onClick={() => setSelectedIds(new Set())}
            >
              Clear
            </Button>
          </div>
        )}

        {/* Template Table */}
        <Card>
          <CardContent className="p-0">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
              <div className="text-xs text-muted-foreground">
                Showing
                {' '}
                <span className="font-medium text-foreground">
                  {table.getRowModel().rows.length}
                </span>
                {' '}
                of
                {' '}
                <span className="font-medium text-foreground">
                  {table.getFilteredRowModel().rows.length}
                </span>
                {' '}
                items
                {table.getFilteredSelectedRowModel().rows.length > 0 && (
                  <>
                    {' · '}
                    <span className="text-primary">
                      {table.getFilteredSelectedRowModel().rows.length}
                      {' '}
                      selected
                    </span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8">
                      <SlidersHorizontal className="mr-1 size-3.5" />
                      Columns
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {table
                      .getAllColumns()
                      .filter(c => c.getCanHide())
                      .map(column => (
                        <DropdownMenuCheckboxItem
                          key={column.id}
                          className="capitalize"
                          checked={column.getIsVisible()}
                          onCheckedChange={value => column.toggleVisibility(!!value)}
                        >
                          {column.id === 'sourcePlatform'
                            ? 'Platform'
                            : column.id === 'contentType'
                              ? 'Type'
                              : column.id === 'engagementScore'
                                ? 'Engagement'
                                : column.id === 'createdAt'
                                  ? 'Created'
                                  : column.id}
                        </DropdownMenuCheckboxItem>
                      ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Table body */}
            <div className="w-full">
              <Table className="w-full table-fixed">
                <TableHeader className="sticky top-0 z-10 bg-card">
                  {table.getHeaderGroups().map(headerGroup => (
                    <TableRow key={headerGroup.id}>
                      {headerGroup.headers.map((header) => {
                        const metaClass = header.column.columnDef.meta?.className ?? '';
                        const size = header.column.columnDef.size;
                        return (
                          <TableHead
                            key={header.id}
                            style={size ? { width: `${size}px` } : undefined}
                            className={`text-xs font-semibold uppercase tracking-wide text-muted-foreground ${metaClass}`}
                          >
                            {header.isPlaceholder
                              ? null
                              : flexRender(header.column.columnDef.header, header.getContext())}
                          </TableHead>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {loading
                    ? (
                        <TableRow>
                          <TableCell
                            colSpan={table.getAllColumns().length}
                            className="h-40 text-center text-muted-foreground"
                          >
                            <Loader2 className="mx-auto size-6 animate-spin" />
                            <p className="mt-2 text-sm">Loading queue...</p>
                          </TableCell>
                        </TableRow>
                      )
                    : table.getRowModel().rows.length === 0
                      ? (
                          <TableRow>
                            <TableCell
                              colSpan={table.getAllColumns().length}
                              className="h-40 text-center text-muted-foreground"
                            >
                              No pending templates match your filters.
                            </TableCell>
                          </TableRow>
                        )
                      : (
                          table.getRowModel().rows.map(row => (
                            <TableRow
                              key={row.id}
                              data-state={row.getIsSelected() && 'selected'}
                              className="align-middle"
                            >
                              {row.getVisibleCells().map((cell) => {
                                const metaClass = cell.column.columnDef.meta?.className ?? '';
                                return (
                                  <TableCell
                                    key={cell.id}
                                    className={`overflow-hidden py-2 align-middle ${metaClass}`}
                                  >
                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                  </TableCell>
                                );
                              })}
                            </TableRow>
                          ))
                        )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination footer */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Rows per page</span>
                <Select
                  value={String(pagination.pageSize)}
                  onValueChange={(v) => {
                    table.setPageSize(Number(v));
                  }}
                >
                  <SelectTrigger className="h-8 w-[72px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 25, 50, 100].map(size => (
                      <SelectItem key={size} value={String(size)}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                Page
                {' '}
                <span className="font-medium text-foreground">
                  {table.getState().pagination.pageIndex + 1}
                </span>
                {' '}
                of
                {' '}
                <span className="font-medium text-foreground">
                  {Math.max(1, table.getPageCount())}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  onClick={() => table.setPageIndex(0)}
                  disabled={!table.getCanPreviousPage()}
                  aria-label="First page"
                >
                  <ChevronsLeft className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                  aria-label="Next page"
                >
                  <ChevronRight className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                  disabled={!table.getCanNextPage()}
                  aria-label="Last page"
                >
                  <ChevronsRight className="size-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Video Preview Dialog */}
      <Dialog open={!!previewTemplate} onOpenChange={() => setPreviewTemplate(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Video Preview</DialogTitle>
            <DialogDescription>
              {previewTemplate?.creatorName}
              {' '}
              —
              {previewTemplate?.contentType}
            </DialogDescription>
          </DialogHeader>
          <div className="mx-auto aspect-[9/16] w-full max-w-sm overflow-hidden rounded-md bg-black">
            {previewTemplate && (
              <PreviewPlayer template={previewTemplate} />
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {previewTemplate?.niches.map(n => (
              <Badge key={n} variant="secondary">
                {n}
              </Badge>
            ))}
            {previewTemplate?.angles.map(a => (
              <Badge key={a} variant="outline">
                {a}
              </Badge>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail Drawer */}
      <Drawer open={!!drawerTemplate} onOpenChange={() => setDrawerTemplate(null)}>
        <DrawerContent className="max-h-[90vh]">
          {drawerTemplate && (
            <>
              <DrawerHeader>
                <DrawerTitle className="flex items-center gap-2">
                  <PlatformIcon platform={drawerTemplate.sourcePlatform} />
                  {drawerTemplate.creatorName}
                </DrawerTitle>
                <DrawerDescription>{drawerTemplate.sourceUrl}</DrawerDescription>
              </DrawerHeader>

              <div className="px-4 pb-2">
                <SuggestionBanner template={drawerTemplate} />
              </div>

              <div className="overflow-y-auto px-4">
                <Tabs defaultValue="preview">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="preview">Video Preview</TabsTrigger>
                    <TabsTrigger value="structure">Structure</TabsTrigger>
                    <TabsTrigger value="tags">Tags & Edit</TabsTrigger>
                  </TabsList>

                  <TabsContent value="preview" className="space-y-4">
                    <div className="mx-auto aspect-[9/16] w-full max-w-sm overflow-hidden rounded-md bg-black">
                      <PreviewPlayer template={drawerTemplate} />
                    </div>
                    <div className="rounded-md bg-muted p-3">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">Transcript</p>
                      <p className="mt-1 text-sm leading-relaxed">{drawerTemplate.transcript}</p>
                    </div>
                  </TabsContent>

                  <TabsContent value="structure" className="space-y-4">
                    <div className="space-y-3">
                      {drawerTemplate.structure.hook && (
                        <div className="rounded-md border-l-4 border-green-500 bg-green-50 p-3 dark:bg-green-900/20">
                          <p className="text-xs font-semibold uppercase text-green-700 dark:text-green-300">
                            Hook (
                            {drawerTemplate.structure.hook.time}
                            s)
                          </p>
                          <p className="mt-1 text-sm">{drawerTemplate.structure.hook.text}</p>
                        </div>
                      )}
                      {drawerTemplate.structure.body && (
                        <div className="rounded-md border-l-4 border-blue-500 bg-blue-50 p-3 dark:bg-blue-900/20">
                          <p className="text-xs font-semibold uppercase text-blue-700 dark:text-blue-300">
                            Body (
                            {drawerTemplate.structure.body.time}
                            s)
                          </p>
                          <p className="mt-1 text-sm">{drawerTemplate.structure.body.text}</p>
                        </div>
                      )}
                      {drawerTemplate.structure.cta && (
                        <div className="rounded-md border-l-4 border-purple-500 bg-purple-50 p-3 dark:bg-purple-900/20">
                          <p className="text-xs font-semibold uppercase text-purple-700 dark:text-purple-300">
                            CTA (
                            {drawerTemplate.structure.cta.time}
                            s)
                          </p>
                          <p className="mt-1 text-sm">{drawerTemplate.structure.cta.text}</p>
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="tags" className="space-y-4">
                    <div>
                      <p className="mb-2 text-sm font-medium">Niches</p>
                      <div className="flex flex-wrap gap-2">
                        {editNiches.map(n => (
                          <Badge key={n} variant="secondary" className="gap-1">
                            {n}
                            <button
                              type="button"
                              onClick={() => removeTag(n, setEditNiches)}
                              className="ml-1 rounded-full hover:bg-destructive/20"
                            >
                              <X className="size-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                      <div className="mt-2 flex gap-2">
                        <Input
                          placeholder="Add niche..."
                          value={newNiche}
                          onChange={e => setNewNiche(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addTag(newNiche, setEditNiches, setNewNiche);
                            }
                          }}
                        />
                        <Button
                          size="sm"
                          onClick={() => addTag(newNiche, setEditNiches, setNewNiche)}
                        >
                          Add
                        </Button>
                      </div>
                    </div>
                    <div>
                      <p className="mb-2 text-sm font-medium">Angles</p>
                      <div className="flex flex-wrap gap-2">
                        {editAngles.map(a => (
                          <Badge key={a} variant="outline" className="gap-1">
                            {a}
                            <button
                              type="button"
                              onClick={() => removeTag(a, setEditAngles)}
                              className="ml-1 rounded-full hover:bg-destructive/20"
                            >
                              <X className="size-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                      <div className="mt-2 flex gap-2">
                        <Input
                          placeholder="Add angle..."
                          value={newAngle}
                          onChange={e => setNewAngle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addTag(newAngle, setEditAngles, setNewAngle);
                            }
                          }}
                        />
                        <Button
                          size="sm"
                          onClick={() => addTag(newAngle, setEditAngles, setNewAngle)}
                        >
                          Add
                        </Button>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>

                {/* Reject Feedback */}
                <div className="mt-4">
                  <p className="mb-2 text-sm font-medium">Rejection Feedback (optional)</p>
                  <Textarea
                    placeholder="Why is this being rejected?"
                    value={rejectFeedback}
                    onChange={e => setRejectFeedback(e.target.value)}
                  />
                </div>
              </div>

              <DrawerFooter className="flex-row justify-end gap-2">
                <DrawerClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DrawerClose>
                <Button
                  variant="destructive"
                  disabled={isLoading}
                  onClick={handleRejectWithFeedback}
                >
                  {isLoading ? <Loader2 className="mr-1 size-4 animate-spin" /> : <X className="mr-1 size-4" />}
                  Reject with Feedback
                </Button>
                <Button
                  variant="default"
                  disabled={isLoading}
                  onClick={handleApproveWithEdits}
                >
                  {isLoading ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Check className="mr-1 size-4" />}
                  Approve with Edits
                </Button>
              </DrawerFooter>
            </>
          )}
        </DrawerContent>
      </Drawer>
    </AdminLayout>
  );
}

function PreviewThumbnail({ template }: { template: Template }) {
  const posterUrl = getVideoPosterUrl(template.thumbnailUrl, { width: 120, height: 160 });

  // Fallback: legacy TikTok rows have empty thumbnail_url — render a platform
  // placeholder instead of a broken <img>.
  if (!posterUrl) {
    return (
      <div className="flex h-16 w-12 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <PlatformIcon platform={template.sourcePlatform} />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={posterUrl}
      alt="thumbnail"
      className="h-16 w-12 object-cover"
    />
  );
}

function PreviewPlayer({ template }: { template: Template }) {
  const mediaUrl = template.mediaUrl || template.thumbnailUrl;
  const isPlayable = isCloudinaryVideoUrl(mediaUrl) || /\.(mp4|mov|webm|ogg|mkv)(\?.*)?$/i.test(mediaUrl || '');
  const posterUrl = getVideoPosterUrl(template.thumbnailUrl, { width: 608, height: 1080 });
  const videoSrc = isPlayable ? getOptimizedVideoUrl(mediaUrl) : null;
  const hasAnyMedia = Boolean(template.mediaUrl || template.thumbnailUrl);

  if (isPlayable && videoSrc) {
    return (
      <video
        controls
        poster={posterUrl}
        className="size-full object-cover"
        src={videoSrc}
      >
        <track kind="captions" src="" label="No captions available" />
      </video>
    );
  }

  if (hasAnyMedia) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={posterUrl}
        alt={template.contentType}
        className="size-full object-cover"
      />
    );
  }

  // No hosted media — fall back to a link to the original source (e.g. legacy
  // TikTok scrapes that were stored without media_url/thumbnail_url).
  return (
    <div className="flex size-full flex-col items-center justify-center gap-2 p-4 text-center text-white">
      <PlatformIcon platform={template.sourcePlatform} />
      <p className="text-xs text-white/70">No hosted preview available.</p>
      {template.sourceUrl && (
        <a
          href={template.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-white underline underline-offset-2"
        >
          Open on
          {' '}
          {template.sourcePlatform}
        </a>
      )}
    </div>
  );
}
