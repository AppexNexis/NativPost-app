import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

type ScheduledEmailProps = {
  brandName: string;
  platforms: string;
  caption: string;
  scheduledFor: string;
  appUrl?: string;
};

const BRAND_PURPLE = '#864FFE';
const BRAND_DARK = '#1A1A1C';
const GRAY_50 = '#F5F5F7';
const GRAY_100 = '#F3F4F6';
const GRAY_200 = '#E5E7EB';
const GRAY_400 = '#9CA3AF';
const GRAY_600 = '#6B7280';
const GRAY_700 = '#374151';
const WHITE = '#FFFFFF';

const main: React.CSSProperties = {
  backgroundColor: GRAY_50,
  fontFamily: '"DM Sans", "Inter", system-ui, -apple-system, sans-serif',
  margin: '0',
  padding: '24px 16px',
};

const container: React.CSSProperties = {
  backgroundColor: WHITE,
  margin: '0 auto',
  maxWidth: '560px',
  borderRadius: '16px',
  overflow: 'hidden',
  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  border: `1px solid ${GRAY_200}`,
};

const header: React.CSSProperties = {
  backgroundColor: BRAND_DARK,
  padding: '28px 36px 24px',
};

const logoText: React.CSSProperties = {
  margin: '0 0 6px',
  fontSize: '24px',
  fontWeight: '700',
  letterSpacing: '-0.5px',
  lineHeight: '1',
};

const logoIcon: React.CSSProperties = {
  display: 'inline-block',
  width: '30px',
  height: '30px',
  lineHeight: '30px',
  borderRadius: '50%',
  backgroundColor: WHITE,
  textAlign: 'center',
  fontSize: '14px',
  fontWeight: '800',
  color: BRAND_DARK,
  marginRight: '8px',
  verticalAlign: 'middle',
};

const logoNativ: React.CSSProperties = { color: WHITE, verticalAlign: 'middle' };
const logoPost: React.CSSProperties = { color: 'rgba(255,255,255,0.45)', verticalAlign: 'middle' };

const tagline: React.CSSProperties = {
  margin: '6px 0 0',
  fontSize: '13px',
  color: GRAY_400,
};

const scheduledBanner: React.CSSProperties = {
  backgroundColor: '#F4F2FE',
  borderTop: `3px solid ${BRAND_PURPLE}`,
  padding: '24px 36px',
};

const scheduledBadge: React.CSSProperties = {
  display: 'inline-block',
  backgroundColor: '#EDE9FE',
  color: '#5B21B6',
  borderRadius: '20px',
  padding: '4px 12px',
  fontSize: '12px',
  fontWeight: '600',
  marginBottom: '12px',
  border: '1px solid #DDD6FE',
};

const scheduledTitle: React.CSSProperties = {
  margin: '0 0 6px',
  fontSize: '22px',
  fontWeight: '700',
  color: BRAND_DARK,
  letterSpacing: '-0.3px',
};

const scheduledSub: React.CSSProperties = {
  margin: '0',
  fontSize: '15px',
  color: '#4B5563',
  lineHeight: '1.6',
};

const content: React.CSSProperties = { padding: '28px 36px' };

const sectionLabel: React.CSSProperties = {
  margin: '0 0 10px',
  fontSize: '11px',
  fontWeight: '600',
  color: GRAY_400,
  textTransform: 'uppercase',
  letterSpacing: '0.8px',
};

const scheduleBox: React.CSSProperties = {
  backgroundColor: '#F5F3FF',
  border: '1px solid #DDD6FE',
  borderRadius: '10px',
  padding: '14px 20px',
  marginBottom: '24px',
};

const scheduleText: React.CSSProperties = {
  margin: '0',
  fontSize: '15px',
  color: '#5B21B6',
  fontWeight: '600',
  lineHeight: '1.5',
};

const captionBox: React.CSSProperties = {
  backgroundColor: '#FAFAFA',
  border: `1px solid ${GRAY_200}`,
  borderLeft: `3px solid ${BRAND_PURPLE}`,
  borderRadius: '0 10px 10px 0',
  padding: '16px 20px',
  marginBottom: '28px',
};

const captionText: React.CSSProperties = {
  margin: '0',
  fontSize: '14px',
  color: GRAY_700,
  lineHeight: '1.7',
  fontStyle: 'italic',
};

const primaryButton: React.CSSProperties = {
  backgroundColor: BRAND_PURPLE,
  borderRadius: '8px',
  color: WHITE,
  fontSize: '14px',
  fontWeight: '600',
  textDecoration: 'none',
  padding: '12px 22px',
  display: 'inline-block',
  marginRight: '10px',
};

const secondaryButton: React.CSSProperties = {
  backgroundColor: GRAY_100,
  borderRadius: '8px',
  color: BRAND_DARK,
  fontSize: '14px',
  fontWeight: '500',
  textDecoration: 'none',
  padding: '12px 22px',
  display: 'inline-block',
  border: `1px solid ${GRAY_200}`,
};

const divider: React.CSSProperties = { borderColor: GRAY_100, margin: '0 36px' };
const footer: React.CSSProperties = { padding: '20px 36px 28px' };

const footerText: React.CSSProperties = {
  margin: '0 0 6px',
  fontSize: '12px',
  color: GRAY_400,
  lineHeight: '1.6',
  textAlign: 'center',
};

const footerLink: React.CSSProperties = { color: GRAY_600, textDecoration: 'underline' };

export default function ScheduledEmail({
  brandName = 'Your Brand',
  platforms = 'LinkedIn',
  caption = '',
  scheduledFor = '',
  appUrl = 'https://app.nativpost.com',
}: ScheduledEmailProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>
        {`Post scheduled for ${scheduledFor} — ${brandName}`}
      </Preview>
      <Body style={main}>
        <Container style={container}>

          {/* ── Header ─────────────────────────── */}
          <Section style={header}>
            <Text style={logoText}>
              <span style={logoIcon}>N</span>
              <span style={logoNativ}>Nativ</span>
              <span style={logoPost}>Post</span>
            </Text>
            <Text style={tagline}>Studio-crafted content, published.</Text>
          </Section>

          {/* ── Scheduled banner ────────────────── */}
          <Section style={scheduledBanner}>
            <span style={scheduledBadge}>Scheduled ⏱</span>
            <Text style={scheduledTitle}>Post scheduled</Text>
            <Text style={scheduledSub}>
              {'Content for '}
              <strong>{brandName}</strong>
              {' has been scheduled to publish on '}
              <strong>{platforms}</strong>
              .
            </Text>
          </Section>

          {/* ── Content ─────────────────────────── */}
          <Section style={content}>
            <Text style={sectionLabel}>Scheduled for</Text>
            <Section style={scheduleBox}>
              <Text style={scheduleText}>{scheduledFor}</Text>
            </Section>

            <Text style={sectionLabel}>Caption preview</Text>
            <Section style={captionBox}>
              <Text style={captionText}>
                {caption.length > 280 ? `${caption.substring(0, 280)}...` : caption}
              </Text>
            </Section>

            <Button href={`${appUrl}/dashboard/calendar`} style={primaryButton}>
              View calendar →
            </Button>
            <Button href={`${appUrl}/dashboard/posts?status=scheduled`} style={secondaryButton}>
              All scheduled
            </Button>
          </Section>

          <Hr style={divider} />

          {/* ── Footer ─────────────────────────── */}
          <Section style={footer}>
            <Text style={footerText}>
              You're receiving this because a post was scheduled on your NativPost account.
            </Text>
            <Text style={footerText}>
              <Link href={`${appUrl}/dashboard/settings`} style={footerLink}>Manage notifications</Link>
              {' · '}
              <Link href="https://nativpost.com" style={footerLink}>NativPost</Link>
              {' · A product of '}
              <Link href="https://www.appexnexis.site/" style={footerLink}>AppexNexis LTD</Link>
            </Text>
          </Section>

        </Container>
      </Body>
    </Html>
  );
}
