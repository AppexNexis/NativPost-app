import { OrganizationList } from '@clerk/nextjs';
import { getTranslations } from 'next-intl/server';
import { AppConfig } from '@/utils/AppConfig';

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

const OrganizationSelectionPage = ({ params }: { params: { locale: string } }) => {
  const isDefault = params.locale === AppConfig.defaultLocale;
  const targetUrl = isDefault ? '/onboarding/setup' : `/${params.locale}/onboarding/setup`;

  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <OrganizationList
        hidePersonal={true}
        skipInvitationScreen={true}
        afterCreateOrganizationUrl={targetUrl}
        afterSelectOrganizationUrl={targetUrl}
      />
    </div>
  );
};

export const dynamic = 'force-dynamic';

export default OrganizationSelectionPage;