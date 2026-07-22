import { redirect } from 'next/navigation';

/**
 * /dashboard/connections is a legacy alias. The canonical route is
 * /dashboard/social-accounts. Both routes had full implementations; we
 * kept social-accounts and redirect any inbound traffic here so bookmarks,
 * OAuth callbacks landing on ?error=... query params, and the nav sidebar
 * all converge on one URL.
 */
export default async function ConnectionsRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') {
      qs.set(key, value);
    } else if (Array.isArray(value) && value[0]) {
      qs.set(key, value[0]);
    }
  }
  const query = qs.toString();
  redirect(`/dashboard/social-accounts${query ? `?${query}` : ''}`);
}
