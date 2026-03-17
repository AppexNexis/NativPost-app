import { NativPostLoader } from '@/components/NativPostLoader';

// This file is automatically used by Next.js App Router as the loading UI
// during page transitions and initial data fetching.
// Placed at the dashboard layout level to cover all dashboard pages.

export default function Loading() {
  return <NativPostLoader />;
}