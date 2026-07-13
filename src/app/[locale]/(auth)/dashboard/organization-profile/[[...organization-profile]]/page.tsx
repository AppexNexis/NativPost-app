import { redirect } from 'next/navigation';

/**
 * /dashboard/organization-profile is a legacy alias. The canonical route is
 * /dashboard/team, which wraps the same Clerk widget with a friendlier URL.
 * Redirect preserves any trailing sub-path Clerk generated internally.
 */
export default async function OrganizationProfileRedirectPage({
  params,
}: {
  params: Promise<{ 'organization-profile'?: string[] }>;
}) {
  const p = await params;
  const trailing = p['organization-profile']?.join('/') ?? '';
  redirect(`/dashboard/team${trailing ? `/${trailing}` : ''}`);
}
