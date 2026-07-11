'use client';

import { XCircle } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

type Props = {
  feedback: string | null;
};

export function RejectionPanel({ feedback }: Props) {
  return (
    <Alert variant="destructive" className="border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20">
      <XCircle className="size-4" />
      <AlertTitle>This post was rejected</AlertTitle>
      <AlertDescription className="mt-1">
        {feedback && feedback.trim().length > 0
          ? feedback
          : 'No rejection reason was recorded.'}
      </AlertDescription>
    </Alert>
  );
}
