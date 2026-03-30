// src/app/[locale]/(auth)/dashboard/posts/new/page.tsx
//
// Redirect /dashboard/posts/new?scheduledDate=YYYY-MM-DD
// → /dashboard/content/create?scheduledDate=YYYY-MM-DD
//
// This page exists purely so the calendar can link to a clean URL.
// All actual creation logic lives in /dashboard/content/create.

import { redirect } from 'next/navigation';

type Props = {
  searchParams: Promise<{ scheduledDate?: string }>;
};

export default async function NewPostRedirectPage({ searchParams }: Props) {
  const { scheduledDate } = await searchParams;
  const dest = scheduledDate
    ? `/dashboard/content/create?scheduledDate=${scheduledDate}`
    : '/dashboard/content/create';
  redirect(dest);
}
