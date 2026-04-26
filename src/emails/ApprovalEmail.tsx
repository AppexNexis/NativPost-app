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

type ApprovalEmailProps = {
  brandName: string;
  contentCount: number;
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
// const GRAY_800     = '#1F2937';
const WHITE = '#FFFFFF';
const AMBER_BG = '#FFFBEB';
const AMBER_BORDER = '#F59E0B';
const AMBER_TEXT = '#92400E';

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

const badgeSection: React.CSSProperties = {
  backgroundColor: AMBER_BG,
  borderTop: `3px solid ${AMBER_BORDER}`,
  padding: '16px 36px',
};

const badge: React.CSSProperties = {
  margin: '0',
  fontSize: '13px',
  fontWeight: '600',
  color: AMBER_TEXT,
};

const content: React.CSSProperties = { padding: '32px 36px 28px' };

const heading: React.CSSProperties = {
  margin: '0 0 16px',
  fontSize: '22px',
  fontWeight: '700',
  color: BRAND_DARK,
  letterSpacing: '-0.3px',
  lineHeight: '1.3',
};

const paragraph: React.CSSProperties = {
  margin: '0 0 16px',
  fontSize: '15px',
  color: '#4B5563',
  lineHeight: '1.7',
};

const ctaSection: React.CSSProperties = { margin: '28px 0' };

const primaryButton: React.CSSProperties = {
  backgroundColor: BRAND_PURPLE,
  borderRadius: '8px',
  color: WHITE,
  fontSize: '15px',
  fontWeight: '600',
  textDecoration: 'none',
  padding: '14px 28px',
  display: 'inline-block',
};

const infoBox: React.CSSProperties = {
  backgroundColor: '#FAFAFA',
  border: `1px solid ${GRAY_200}`,
  borderRadius: '10px',
  padding: '18px 20px',
};

const infoTitle: React.CSSProperties = {
  margin: '0 0 12px',
  fontSize: '13px',
  fontWeight: '600',
  color: GRAY_700,
};

const infoItem: React.CSSProperties = {
  margin: '0 0 8px',
  fontSize: '13px',
  color: GRAY_600,
  lineHeight: '1.6',
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

export default function ApprovalEmail({
  brandName = 'Your Brand',
  contentCount = 1,
  appUrl = 'https://app.nativpost.com',
}: ApprovalEmailProps) {
  const plural = contentCount > 1 ? 's' : '';
  return (
    <Html lang="en">
      <Head />
      <Preview>
        {`${contentCount} new post${plural} ready for your approval — ${brandName}`}
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
            <Text style={tagline}>Your content studio</Text>
          </Section>

          {/* ── Badge ──────────────────────────── */}
          <Section style={badgeSection}>
            <Text style={badge}>
              {contentCount}
              {' post'}
              {plural}
              {' awaiting review'}
            </Text>
          </Section>

          {/* ── Main content ───────────────────── */}
          <Section style={content}>
            <Text style={heading}>
              New content ready for
              {' '}
              {brandName}
            </Text>
            <Text style={paragraph}>
              Your NativPost team has crafted
              {' '}
              <strong>
                {contentCount}
                {' new post'}
                {plural}
              </strong>
              {' for '}
              <strong>{brandName}</strong>
              . Each piece has been reviewed for brand alignment, quality, and platform optimisation.
            </Text>
            <Text style={paragraph}>
              Take a look, make any edits you'd like, and approve the ones you want to go live.
            </Text>

            <Section style={ctaSection}>
              <Button href={`${appUrl}/dashboard/approvals`} style={primaryButton}>
                Review content now →
              </Button>
            </Section>

            <Section style={infoBox}>
              <Text style={infoTitle}>What happens after you approve?</Text>
              <Text style={infoItem}>→ Approved posts are ready to publish or schedule</Text>
              <Text style={infoItem}>→ Add graphics, videos, or publish as-is</Text>
              <Text style={infoItem}>→ You get a confirmation email when it goes live</Text>
            </Section>
          </Section>

          <Hr style={divider} />

          {/* ── Footer ─────────────────────────── */}
          <Section style={footer}>
            <Text style={footerText}>
              You're receiving this because you have pending approvals on NativPost.
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
