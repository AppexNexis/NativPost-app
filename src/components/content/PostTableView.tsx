'use client';

import type { ColumnDef, SortingState } from '@tanstack/react-table';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, CheckCircle2, MoreVertical, PencilLine, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ContentItem } from '@/types/v2';
import { cn } from '@/utils/Helpers';

import {
  ctLabel,
  getThumb,
  getVideoUrl,
  isVideoContentType,
  PlatformIcon,
} from './preview-helpers';

const STATUS_STYLE: Record<string, { label: string; dot: string; bg: string }> = {
  draft: { label: 'Draft', dot: 'bg-zinc-400', bg: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-700/50 dark:text-zinc-400' },
  pending_review: { label: 'Pending', dot: 'bg-amber-400', bg: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400' },
  approved: { label: 'Approved', dot: 'bg-emerald-500', bg: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' },
  scheduled: { label: 'Scheduled', dot: 'bg-blue-500', bg: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' },
  published: { label: 'Published', dot: 'bg-emerald-600', bg: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' },
  rejected: { label: 'Rejected', dot: 'bg-red-400', bg: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400' },
  archived: { label: 'Archived', dot: 'bg-zinc-500', bg: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-700/50 dark:text-zinc-400' },
};

function formatDate(item: ContentItem): string {
  const ref = item.scheduledFor || item.publishedAt || item.createdAt;
  if (!ref) {
    return '—';
  }
  return new Date(ref).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function ThumbCell({ item }: { item: ContentItem }) {
  const thumb = getThumb(item);
  const videoUrl = getVideoUrl(item);
  const isVideo = isVideoContentType(item);
  return (
    <Link
      href={`/dashboard/content/${item.id}`}
      className="relative block h-12 w-9 shrink-0 overflow-hidden rounded bg-muted"
    >
      {isVideo && videoUrl
        ? (
            <video
              src={videoUrl}
              poster={thumb ?? undefined}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              className="size-full object-cover"
            />
          )
        : thumb
          ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumb} alt="" className="size-full object-cover" />
            )
          : (
              <div className="flex size-full items-center justify-center text-[8px] text-muted-foreground">
                {ctLabel(item.contentType).slice(0, 3)}
              </div>
            )}
    </Link>
  );
}

function SortIcon({ sorted }: { sorted: false | 'asc' | 'desc' }) {
  if (sorted === 'asc') {
    return <ArrowUp className="ml-1 size-3" />;
  }
  if (sorted === 'desc') {
    return <ArrowDown className="ml-1 size-3" />;
  }
  return <ArrowUpDown className="ml-1 size-3 opacity-40" />;
}

type Props = {
  items: ContentItem[];
  selected: Set<string>;
  onToggleSelected: (id: string) => void;
  onToggleAll: (ids: string[], select: boolean) => void;
  onApprove: (id: string) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
};

export function PostTableView({
  items,
  selected,
  onToggleSelected,
  onToggleAll,
  onApprove,
  onDelete,
}: Props) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const allIds = useMemo(() => items.map(i => i.id), [items]);
  const allSelected = allIds.length > 0 && allIds.every(id => selected.has(id));
  const someSelected = allIds.some(id => selected.has(id));

  const columns = useMemo<ColumnDef<ContentItem>[]>(() => [
    {
      id: 'select',
      header: () => (
        <Checkbox
          checked={allSelected ? true : someSelected ? 'indeterminate' : false}
          onCheckedChange={v => onToggleAll(allIds, Boolean(v))}
          aria-label="Select all rows"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={selected.has(row.original.id)}
          onCheckedChange={() => onToggleSelected(row.original.id)}
          aria-label={`Select row ${row.original.id}`}
        />
      ),
      enableSorting: false,
      size: 32,
    },
    {
      id: 'thumb',
      header: '',
      cell: ({ row }) => <ThumbCell item={row.original} />,
      enableSorting: false,
      size: 48,
    },
    {
      accessorKey: 'caption',
      header: ({ column }) => (
        <button
          type="button"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="inline-flex items-center text-micro font-medium uppercase tracking-wide text-muted-foreground"
        >
          Caption
          <SortIcon sorted={column.getIsSorted()} />
        </button>
      ),
      cell: ({ row }) => (
        <Link href={`/dashboard/content/${row.original.id}`} className="block min-w-0">
          <p className="line-clamp-2 text-xs">
            {row.original.caption || <span className="italic text-muted-foreground">No caption</span>}
          </p>
        </Link>
      ),
    },
    {
      accessorKey: 'contentType',
      header: ({ column }) => (
        <button
          type="button"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="inline-flex items-center text-micro font-medium uppercase tracking-wide text-muted-foreground"
        >
          Type
          <SortIcon sorted={column.getIsSorted()} />
        </button>
      ),
      cell: ({ row }) => (
        <span className="text-micro text-muted-foreground">{ctLabel(row.original.contentType)}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: ({ column }) => (
        <button
          type="button"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="inline-flex items-center text-micro font-medium uppercase tracking-wide text-muted-foreground"
        >
          Status
          <SortIcon sorted={column.getIsSorted()} />
        </button>
      ),
      cell: ({ row }) => {
        const style = STATUS_STYLE[row.original.status] ?? STATUS_STYLE.draft!;
        return (
          <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium', style.bg)}>
            <span className={cn('size-1.5 rounded-full', style.dot)} />
            {style.label}
          </span>
        );
      },
    },
    {
      id: 'platforms',
      header: () => <span className="text-micro font-medium uppercase tracking-wide text-muted-foreground">Platforms</span>,
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          {(row.original.targetPlatforms ?? []).slice(0, 3).map(p => (
            <PlatformIcon key={p} platform={p} size="sm" />
          ))}
        </div>
      ),
      enableSorting: false,
    },
    {
      accessorFn: (row: ContentItem) => row.scheduledFor || row.publishedAt || row.createdAt,
      id: 'date',
      header: ({ column }) => (
        <button
          type="button"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="inline-flex items-center text-micro font-medium uppercase tracking-wide text-muted-foreground"
        >
          Date
          <SortIcon sorted={column.getIsSorted()} />
        </button>
      ),
      cell: ({ row }) => (
        <span className="text-micro text-muted-foreground">{formatDate(row.original)}</span>
      ),
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => {
        const item = row.original;
        const isApproved = item.status === 'approved' || item.status === 'scheduled' || item.status === 'published';
        return (
          <div className="flex items-center justify-end gap-1">
            {!isApproved && (
              <button
                type="button"
                onClick={() => onApprove(item.id)}
                className="inline-flex size-6 items-center justify-center rounded-md text-emerald-600 transition-colors hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                aria-label="Approve"
                title="Approve"
              >
                <CheckCircle2 className="size-3.5" />
              </button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex size-6 items-center justify-center rounded-md text-foreground/70 transition-colors hover:bg-muted"
                  aria-label="More actions"
                >
                  <MoreVertical className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href={`/dashboard/content/${item.id}`}>
                    <PencilLine className="mr-2 size-3.5" />
                    Open editor
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-600 focus:text-red-600"
                  onSelect={() => onDelete(item.id)}
                >
                  <Trash2 className="mr-2 size-3.5" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ], [selected, allIds, allSelected, someSelected, onToggleSelected, onToggleAll, onApprove, onDelete]);

  const table = useReactTable({
    data: items,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border bg-card">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map(headerGroup => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map(header => (
                <TableHead key={header.id} className="whitespace-nowrap">
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length
            ? (
                table.getRowModel().rows.map(row => (
                  <TableRow
                    key={row.id}
                    data-state={selected.has(row.original.id) ? 'selected' : undefined}
                  >
                    {row.getVisibleCells().map(cell => (
                      <TableCell key={cell.id} className="align-middle">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )
            : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center text-body text-muted-foreground">
                    No posts.
                  </TableCell>
                </TableRow>
              )}
        </TableBody>
      </Table>
    </div>
  );
}
