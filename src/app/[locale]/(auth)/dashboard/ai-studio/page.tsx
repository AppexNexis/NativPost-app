import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AIStudioPage } from '@/components/ai-studio/AIStudioPage';
import { getAuthContext } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'AI Studio | NativPost',
  description: 'Generate AI images, videos, and talking-head UGC',
};

export default async function Page() {
  const { error } = await getAuthContext();
  if (error) {
    redirect('/sign-in');
  }

  return <AIStudioPage />;
}
