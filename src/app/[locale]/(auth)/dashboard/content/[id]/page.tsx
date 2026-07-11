'use client';

import { use } from 'react';

import { ContentDetailClient } from '@/components/content/detail/ContentDetailClient';

export default function ContentIdPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ContentDetailClient id={id} />;
}
