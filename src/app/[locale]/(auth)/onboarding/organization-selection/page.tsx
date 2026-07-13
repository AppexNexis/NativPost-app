import { OrganizationList } from '@clerk/nextjs';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(props: { params: { locale: string } }) {
  const t = await getTranslations({
    locale: props.params.locale,
    namespace: 'Dashboard',
  });

  return {
    title: t('meta_title'),
    description: t('meta_description'),
  };
}

const OrganizationSelectionPage = () => (
  <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
    {/* Logo */}
    <div className="mb-8 flex justify-center">
      <Image
        src="/assets/images/shared/main-logo-dark.svg"
        alt="NativPost"
        width={140}
        height={32}
        priority
        className="dark:brightness-0 dark:invert"
      />
    </div>

    {/* Heading */}
    <div className="mb-8 max-w-md text-center">
      <h1 className="text-xl font-semibold tracking-tight text-foreground">
        Get started with NativPost
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Select or create a workspace to set up your brand profile and start generating content.
      </p>
    </div>

    {/* Clerk org list */}
    <OrganizationList
      afterSelectOrganizationUrl="/onboarding/setup"
      afterCreateOrganizationUrl="/onboarding/setup"
      hidePersonal
      skipInvitationScreen
    />
  </div>
);

export const dynamic = 'force-dynamic';

export default OrganizationSelectionPage;
