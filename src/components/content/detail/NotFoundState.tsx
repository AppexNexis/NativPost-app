'use client';

import { ArrowLeft, FileQuestion } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export function NotFoundState() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <Card className="flex max-w-md flex-col items-center gap-3 p-8 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-muted">
          <FileQuestion className="size-7 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Post not found</h2>
          <p className="mt-1 text-body text-muted-foreground">
            This post may have been deleted or you might not have permission to view it.
          </p>
        </div>
        <Button asChild variant="outline" className="mt-2">
          <Link href="/dashboard/posts">
            <ArrowLeft className="mr-2 size-4" />
            Back to posts
          </Link>
        </Button>
      </Card>
    </div>
  );
}
