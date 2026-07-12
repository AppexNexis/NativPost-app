'use client';

import { ChevronRight, ReceiptText } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { CreditActivity } from '@/lib/ai-studio/server';

interface Props {
  activity: CreditActivity[];
}

function typeLabel(t: CreditActivity['type']): string {
  switch (t) {
    case 'generation': return 'Generation';
    case 'credit_consumption': return 'Consumption';
    case 'purchase': return 'Top-up';
    case 'bonus': return 'Bonus';
    case 'refund': return 'Refund';
    case 'subscription_renewal': return 'Renewal';
    default: return 'Activity';
  }
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function fmtAmount(a: number): string {
  const dollars = a / 10;
  const sign = a > 0 ? '+' : a < 0 ? '' : '';
  return `${sign}$${Math.abs(dollars).toFixed(2)}`;
}

export function CreditActivityTable({ activity }: Props) {
  const items = activity.slice(0, 25);

  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-background dark:bg-neutral-950">
      <div className="flex items-center justify-between border-b p-5">
        <div>
          <h3 className="text-base font-semibold">Credit Activity</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Recent purchases and consumption from the last 30 days.
          </p>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link href="/dashboard/billing">
            <ReceiptText className="mr-1.5 size-3.5" />
            Invoices
            <ChevronRight className="ml-0.5 size-3.5" />
          </Link>
        </Button>
      </div>
      {items.length === 0
        ? (
            <div className="px-5 pb-6 text-sm text-muted-foreground">
              No credit activity yet. Your first generation or top-up will show up here.
            </div>
          )
        : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map(row => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {fmtDate(row.createdAt)}
                      </TableCell>
                      <TableCell className="text-sm">
                        <span className="rounded-md border px-2 py-0.5 text-xs font-medium">
                          {typeLabel(row.type)}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-md truncate text-sm">
                        {row.description}
                      </TableCell>
                      <TableCell className={`text-right text-sm font-medium tabular-nums ${
                        row.amount > 0 ? 'text-emerald-500' : row.amount < 0 ? 'text-foreground' : 'text-muted-foreground'
                      }`}
                      >
                        {fmtAmount(row.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
    </div>
  );
}
