'use client';

import { useRouter } from 'next/navigation';
import React from 'react';

import { ContentLibraryBrowser } from '@/components/content-library/ContentLibraryBrowser';
import type { ContentTemplate } from '@/types/v2';

type ContentLibraryPageProps = {
  templates: ContentTemplate[];
};

export function ContentLibraryPage({ templates }: ContentLibraryPageProps) {
  const router = useRouter();
  const [isRemixing, setIsRemixing] = React.useState<string | null>(null);
  const [remixError, setRemixError] = React.useState<string | null>(null);

  const handleRemix = async (template: ContentTemplate) => {
    if (isRemixing) {
      return;
    }
    setIsRemixing(template.id);
    setRemixError(null);

    try {
      router.push(`/dashboard/content/create?templateId=${template.id}`);
    } catch (err) {
      console.error('[Remix] Failed:', err);
      setRemixError('Remix failed. Please try again.');
      setIsRemixing(null);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-12">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {remixError && (
          <div className="mb-4 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {remixError}
          </div>
        )}
        <ContentLibraryBrowser templates={templates} onRemix={handleRemix} />
      </div>

      {isRemixing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="rounded-xl bg-card p-6 shadow-xl">
            <p className="text-sm font-medium text-card-foreground">Opening remix editor...</p>
          </div>
        </div>
      )}
    </div>
  );
}
