import { redirect } from 'next/navigation';

/**
 * /dashboard/content (list) is a legacy alias for /dashboard/posts. Only the
 * bare list route redirects; /dashboard/content/[id] (detail) and
 * /dashboard/content/create (composer) remain in place because they are the
 * canonical detail/creation surfaces referenced everywhere.
 */
export default function ContentListRedirectPage() {
  redirect('/dashboard/posts');
}
