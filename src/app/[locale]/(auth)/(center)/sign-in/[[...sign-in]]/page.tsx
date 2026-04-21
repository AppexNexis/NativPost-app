import { SignIn } from '@clerk/nextjs';
import { getTranslations } from 'next-intl/server';

import { getI18nPath } from '@/utils/Helpers';
// import Image from 'next/image';

export async function generateMetadata(props: { params: { locale: string } }) {
  const t = await getTranslations({
    locale: props.params.locale,
    namespace: 'SignIn',
  });

  return {
    title: t('meta_title'),
    description: t('meta_description'),
  };
}

const SignInPage = (props: { params: { locale: string } }) => (
  <>
    {/* <Image src="/assets/images/shared/main-logo.svg" alt="Sign In Illustration" className="mb-6" width={100} height={100} /> */}
    <SignIn path={getI18nPath('/sign-in', props.params.locale)} />
  </>

);

export default SignInPage;
