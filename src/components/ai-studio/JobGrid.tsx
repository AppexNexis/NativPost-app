'use client';

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
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border bg-background text-sm text-muted-foreground">
        No generations yet. Enter a prompt below to start.
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
