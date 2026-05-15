import { OrganizationProfile } from '@clerk/nextjs';

import { PageHeader } from '@/features/dashboard/PageHeader';

export default function TeamPage() {
  return (
    <>
      <PageHeader
        title="Team"
        description="Manage team members, roles, and invitations for your organization."
      />
      <div className="rounded-xl border bg-background">
        <OrganizationProfile
          routing="hash"
          appearance={{
            elements: {
              rootBox: 'w-full',
              cardBox: 'w-full shadow-none border-0',
              navbar: 'border-r',
              // Hide the General tab — org settings live in /dashboard/settings
              navbarButton__general: 'hidden',
            },
          }}
        />
      </div>
    </>
  );
}
