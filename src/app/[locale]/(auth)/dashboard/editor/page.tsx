'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import EditorPage from '@/components/editor/EditorPage';

function EditorContent() {
  const searchParams = useSearchParams();
  const editId = searchParams.get('edit') || undefined;
  const contentItemId = searchParams.get('contentItemId') || undefined;

  return (
    <div className="-mx-4 -mt-4 h-full lg:-mx-6 lg:-mt-6">
      <EditorPage editId={editId} contentItemId={contentItemId} />
    </div>
  );
}

export default function EditorRoutePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <div className="size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      }
    >
      <EditorContent />
    </Suspense>
  );
}
