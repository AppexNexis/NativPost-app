import { Button, Section, Text } from '@react-email/components';
import * as React from 'react';

import {
  APP_ORIGIN,
  BRAND_DARK,
  BRAND_PURPLE,
  BRAND_PURPLE_TINT,
  content,
  EmailLayout,
  GRAY_600,
  paragraph,
  primaryButton,
  secondaryButton,
  strongText,
  WHITE,
} from './_theme';

type ApprovalEmailProps = {
  brandName: string;
  contentCount: number;
  appUrl?: string;
};

const banner: React.CSSProperties = {
  backgroundColor: BRAND_PURPLE_TINT,
  borderTop: `3px solid ${BRAND_PURPLE}`,
  padding: '24px 36px',
};

const badge: React.CSSProperties = {
  display: 'inline-block',
  backgroundColor: BRAND_PURPLE,
  color: WHITE,
  borderRadius: '20px',
  padding: '4px 12px',
  fontSize: '12px',
  fontWeight: '600',
  marginBottom: '12px',
};

const countNumber: React.CSSProperties = {
  margin: '0 0 4px',
  fontSize: '34px',
  fontWeight: '700',
  color: BRAND_DARK,
  letterSpacing: '-1px',
  lineHeight: '1',
};

const countLabel: React.CSSProperties = {
  margin: '0',
  fontSize: '15px',
  color: GRAY_600,
  lineHeight: '1.6',
};

export default function ApprovalEmail({
  brandName = 'Your Brand',
  contentCount = 1,
  appUrl = APP_ORIGIN,
}: ApprovalEmailProps) {
  const plural = contentCount === 1 ? 'post' : 'posts';

  return (
    <EmailLayout
      preview={`${contentCount} new ${plural} ready for review — ${brandName}`}
      tagline="Studio-crafted content, on autopilot."
      reason="You're receiving this because new content is waiting for review on your NativPost account."
      appUrl={appUrl}
    >
      <Section style={banner}>
        <span style={badge}>Ready for review</span>
        <Text style={countNumber}>{contentCount}</Text>
        <Text style={countLabel}>
          {`new ${plural} for `}
          <span style={strongText}>{brandName}</span>
          {' are waiting for your approval.'}
        </Text>
      </Section>

      <Section style={content}>
        <Text style={paragraph}>
          Each one is written in your brand voice and rendered ready to post.
          Approve what you like, edit anything that needs a tweak, and we'll
          publish on your schedule.
        </Text>

        <Button href={`${appUrl}/dashboard/posts`} style={primaryButton}>
          {`Review ${plural} →`}
        </Button>
        <Button href={`${appUrl}/dashboard/calendar`} style={secondaryButton}>
          Open calendar
        </Button>
      </Section>
    </EmailLayout>
  );
}
