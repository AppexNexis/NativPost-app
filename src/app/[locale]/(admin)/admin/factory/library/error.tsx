'use client';

import { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';

export default function FactoryLibraryError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Factory Library page error:', error);
  }, [error]);

  return (
    <main className="px-5 py-6">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <Card className="border-red-200 dark:border-red-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertTriangle className="h-5 w-5" />
              Library Page Error
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Something went wrong while loading the Factory Library page.
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              {error.message || 'Unknown error'}
              {error.digest && ` (${error.digest})`}
            </p>
            <button
              onClick={reset}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Try again
            </button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
