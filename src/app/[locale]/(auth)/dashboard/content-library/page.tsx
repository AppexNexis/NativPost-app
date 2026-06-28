import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { ContentLibraryPage } from '@/components/content-library/ContentLibraryPage';
import { getAuthContext } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'Content Library | NativPost',
  description: 'Browse and remix trending short-form content',
};

export default async function ContentLibrary() {
  const { error, orgId } = await getAuthContext();

  if (error || !orgId) {
    redirect('/sign-in');
  }

  return (
    <div className="min-h-screen bg-background">
      <ContentLibraryPage />
    </div>
  );
}
