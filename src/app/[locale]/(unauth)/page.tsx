import { redirect } from 'next/navigation';

// The web app (app.nativpost.com) has no public landing page.
// Marketing site lives at nativpost.com (separate deployment).
// This page redirects visitors to sign-in, which then goes to dashboard.
export default function IndexPage() {
  redirect('/sign-in');
}
