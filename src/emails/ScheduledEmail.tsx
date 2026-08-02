import { Button, Section, Text } from '@react-email/components';
import * as React from 'react';

import {
  APP_ORIGIN,
  BRAND_DARK,
  BRAND_PURPLE,
  BRAND_PURPLE_TINT,
  captionBox,
  captionText,
  content,
  EmailLayout,
  GRAY_600,
  humanisePlatforms,
  primaryButton,
  secondaryButton,
  sectionLabel,
  strongText,
  WHITE,
} from './_theme';

type ScheduledEmailProps = {
  brandName: string;
  platforms: string;
  caption: string;
  scheduledFor: string;
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

const title: React.CSSProperties = {
  margin: '0 0 6px',
  fontSize: '22px',
  fontWeight: '700',
  color: BRAND_DARK,
  letterSpacing: '-0.3px',
};

const sub: React.CSSProperties = {
  margin: '0',
  fontSize: '15px',
  color: GRAY_600,
  lineHeight: '1.6',
};

const whenRow: React.CSSProperties = {
  backgroundColor: '#FAFAFA',
  border: `1px solid ${GRAY_600}22`,
  borderRadius: '10px',
  padding: '14px 18px',
  marginBottom: '24px',
};

export default function ScheduledEmail({
  brandName = 'Your Brand',
  platforms = 'LinkedIn',
  caption = '',
  scheduledFor = '',
  appUrl = APP_ORIGIN,
}: ScheduledEmailProps) {
  const channels = humanisePlatforms(platforms);

  return (
    <EmailLayout
      preview={`Scheduled for ${channels} — ${brandName}`}
      tagline="Studio-crafted content, on autopilot."
      reason="You're receiving this because a post was scheduled on your NativPost account."
      appUrl={appUrl}
    >
      <Section style={banner}>
        <span style={badge}>Scheduled</span>
        <Text style={title}>Your post is queued</Text>
        <Text style={sub}>
          {'Content for '}
          <span style={strongText}>{brandName}</span>
          {' will publish to '}
          <span style={strongText}>{channels}</span>
          {'. Nothing else to do — we\'ll post it for you.'}
        </Text>
      </Section>

      <Section style={content}>
        <Text style={sectionLabel}>Going live</Text>
        <Section style={whenRow}>
          <Text style={{ margin: '0', fontSize: '15px', fontWeight: '600', color: BRAND_DARK }}>
            {scheduledFor}
          </Text>
        </Section>

        <Text style={sectionLabel}>What will publish</Text>
        <Section style={captionBox}>
          <Text style={captionText}>
            {caption.length > 280 ? `${caption.substring(0, 280)}…` : caption}
          </Text>
        </Section>

        <Button href={`${appUrl}/dashboard/calendar`} style={primaryButton}>
          View calendar →
        </Button>
        <Button href={`${appUrl}/dashboard/posts`} style={secondaryButton}>
          Edit post
        </Button>
      </Section>
    </EmailLayout>
  );
}
