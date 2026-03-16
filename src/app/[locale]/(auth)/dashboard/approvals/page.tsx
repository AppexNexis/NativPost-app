import { CheckCircle2 } from 'lucide-react';

import { EmptyState } from '@/features/dashboard/EmptyState';
import { PageHeader } from '@/features/dashboard/PageHeader';

export default function ApprovalsPage() {
  return (
    <>
      <PageHeader
        title="Approvals"
        description="Review and approve content before it goes live."
      />
      <EmptyState
        icon={CheckCircle2}
        title="All caught up"
        description="No content waiting for your approval. When NativPost generates new content, it'll appear here for your review."
      />
    </>
  );
}
