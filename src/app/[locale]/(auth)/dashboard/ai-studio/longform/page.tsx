import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { LongFormStudio } from '@/components/ai-studio/LongFormStudio';
import { getAuthContext } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'Long Form Video | AI Studio | NativPost',
  description: 'Create 2-5 minute AI-generated videos with script generation, scene composition, and automatic assembly.',
};

export default async function Page() {
  const { error } = await getAuthContext();
  if (error) {
    redirect('/sign-in');
  }

  return <LongFormStudio />;
}
