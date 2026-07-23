'use client';

import { Sparkles } from 'lucide-react';

import type { AiStudioJobView } from './JobCard';
import { JobCard } from './JobCard';

type JobGridProps = {
  jobs: AiStudioJobView[];
  onCanceled?: () => void;
  onRetried?: () => void;
};

export function JobGrid({ jobs, onCanceled, onRetried }: JobGridProps) {
  if (jobs.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-background text-center">
        <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-primary/10">
          <Sparkles className="size-5 text-primary" />
        </div>
        <p className="text-heading">Your canvas is empty</p>
        <p className="mt-1 max-w-xs text-body text-muted-foreground">
          Describe what you want in the prompt below, generations land here and sync to your Media Library.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {jobs.map(job => (
        <JobCard key={job.id} job={job} onCanceled={onCanceled} onRetried={onRetried} />
      ))}
    </div>
  );
}
