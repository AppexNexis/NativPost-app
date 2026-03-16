import { BarChart3 } from 'lucide-react';

import { EmptyState } from '@/features/dashboard/EmptyState';
import { PageHeader } from '@/features/dashboard/PageHeader';

export default function AnalyticsPage() {
  return (
    <>
      <PageHeader
        title="Analytics"
        description="Track how your content performs across all platforms."
      />
      <EmptyState
        icon={BarChart3}
        title="No data yet"
        description="Once you start publishing content, analytics will appear here. Connect your social accounts and publish your first post to begin tracking performance."
        actionLabel="Connect accounts"
        actionHref="/dashboard/social-accounts"
      />
    </>
  );
}
