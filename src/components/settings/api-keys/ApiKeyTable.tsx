'use client';

import { KeyRound, MoreHorizontal, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import type { RevokeTarget } from './RevokeKeyDialog';

export type ApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  lastFour: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
};

type Props = {
  rows: ApiKeyRow[];
  onRevokeRequest: (target: RevokeTarget) => void;
};

function formatDate(iso: string | null): string {
  if (!iso) {
    return '—';
  }
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatRelative(iso: string | null): string {
  if (!iso) {
    return 'Never used';
  }
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.max(1, Math.round((now - then) / 1000));
  if (diffSec < 60) {
    return `${diffSec}s ago`;
  }
  if (diffSec < 3600) {
    return `${Math.round(diffSec / 60)}m ago`;
  }
  if (diffSec < 86_400) {
    return `${Math.round(diffSec / 3600)}h ago`;
  }
  if (diffSec < 86_400 * 30) {
    return `${Math.round(diffSec / 86_400)}d ago`;
  }
  return formatDate(iso);
}

export function ApiKeyTable({ rows, onRevokeRequest }: Props) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-12 text-center">
        <div className="rounded-full bg-muted p-3 text-muted-foreground">
          <KeyRound className="size-5" />
        </div>
        <p className="text-sm font-medium">No API keys yet</p>
        <p className="max-w-xs text-meta text-muted-foreground">
          Create a key to start calling the NativPost API from your own tools,
          scripts, or automation platforms.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Name</th>
            <th className="px-4 py-3 font-medium">Key</th>
            <th className="px-4 py-3 font-medium">Created</th>
            <th className="px-4 py-3 font-medium">Last used</th>
            <th className="w-12 px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => {
            const expired = row.expiresAt && new Date(row.expiresAt).getTime() < Date.now();
            return (
              <tr key={row.id} className="hover:bg-muted/30">
                <td className="px-4 py-3">
                  <div className="font-medium text-foreground">{row.name}</div>
                  {expired && (
                    <div className="mt-0.5 text-xs text-red-500">Expired</div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                    {row.prefix}
                    _••••
                    {row.lastFour}
                  </code>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatDate(row.createdAt)}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatRelative(row.lastUsedAt)}
                </td>
                <td className="px-4 py-3">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-8">
                        <MoreHorizontal className="size-4" />
                        <span className="sr-only">Actions</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => onRevokeRequest({
                          id: row.id,
                          name: row.name,
                          lastFour: row.lastFour,
                        })}
                        className="text-red-500 focus:text-red-500"
                      >
                        <Trash2 className="mr-2 size-4" />
                        Revoke
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
