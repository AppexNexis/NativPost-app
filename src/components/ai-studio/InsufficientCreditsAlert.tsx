'use client';

import { AlertCircle } from 'lucide-react';
import Link from 'next/link';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

interface InsufficientCreditsAlertProps {
  required: number;
  available: number;
  onDismiss?: () => void;
}

export function InsufficientCreditsAlert({
  required,
  available,
  onDismiss,
}: InsufficientCreditsAlertProps) {
  return (
    <Alert variant="destructive" className="flex items-start gap-3">
      <AlertCircle className="h-4 w-4" />
      <div className="flex-1 space-y-2">
        <AlertTitle>Not enough credits</AlertTitle>
        <AlertDescription>
          This generation needs {required.toLocaleString()} credits. You have{' '}
          {available.toLocaleString()} available.
        </AlertDescription>
        <div className="flex items-center gap-2 pt-1">
          <Button asChild size="sm" variant="secondary">
            <Link href="/dashboard/settings/billing">Buy credits</Link>
          </Button>
          {onDismiss && (
            <Button size="sm" variant="ghost" onClick={onDismiss}>
              Dismiss
            </Button>
          )}
        </div>
      </div>
    </Alert>
  );
}
