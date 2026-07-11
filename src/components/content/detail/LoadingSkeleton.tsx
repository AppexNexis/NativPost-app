'use client';

import { Skeleton } from '@/components/ui/skeleton';

export function LoadingSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
        <div className="rounded-xl border bg-card p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between border-b pb-3">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-6 w-16" />
          </div>
          <div className="mx-auto aspect-[9/16] w-full max-w-[360px]">
            <Skeleton className="size-full rounded-2xl" />
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4 sm:p-5">
          <Skeleton className="mb-3 h-5 w-16" />
          <Skeleton className="mb-2 h-3 w-full" />
          <Skeleton className="mb-2 h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      </div>
      <div className="hidden space-y-4 lg:block">
        <div className="rounded-xl border bg-card p-5">
          <Skeleton className="mb-3 h-5 w-20" />
          <Skeleton className="mb-2 h-9 w-full rounded-md" />
          <Skeleton className="mb-2 h-9 w-full rounded-md" />
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
        <div className="rounded-xl border bg-card p-5">
          <Skeleton className="mb-3 h-5 w-16" />
          <Skeleton className="mb-2 h-4 w-full" />
          <Skeleton className="mb-2 h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    </div>
  );
}
