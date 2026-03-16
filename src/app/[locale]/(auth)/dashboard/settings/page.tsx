import { OrganizationProfile } from '@clerk/nextjs';

import { PageHeader } from '@/features/dashboard/PageHeader';

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Manage your organization, team members, and preferences."
      />
      <div className="rounded-xl border bg-background">
        <OrganizationProfile
          routing="hash"
          appearance={{
            elements: {
              rootBox: 'w-full',
              cardBox: 'w-full shadow-none border-0',
              navbar: 'border-r',
            },
          }}
        />
      </div>
    </>
  );
}
