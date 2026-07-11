'use client';

import { useParams } from 'next/navigation';

import { ContentDetailClient } from '@/components/content/detail/ContentDetailClient';

export default function ContentIdPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  if (!id) return null;
  return <ContentDetailClient id={id} />;
}
