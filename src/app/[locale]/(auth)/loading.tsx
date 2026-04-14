import { NativPostLoader } from '@/components/NativPostLoader';

// Shows the branded NativPost loader while Clerk resolves authentication.
// This replaces the white screen that appears before redirect to dashboard.

export default function AuthLoading() {
  return <NativPostLoader message="" />;
}
