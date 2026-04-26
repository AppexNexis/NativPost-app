import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  // Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

type WelcomeEmailProps = {
  userName: string;
  appUrl?: string;
};

const BRAND_PURPLE = '#864FFE';
const BRAND_DARK = '#1A1A1C';
const GRAY_50 = '#F5F5F7';
const GRAY_100 = '#F3F4F6';
const GRAY_200 = '#E5E7EB';
const GRAY_400 = '#9CA3AF';
const GRAY_600 = '#6B7280';
// const GRAY_700     = '#374151';
const GRAY_800 = '#1F2937';
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

const logoNativ: React.CSSProperties = {
  color: WHITE,
  verticalAlign: 'middle',
};

const logoPost: React.CSSProperties = {
  color: 'rgba(255,255,255,0.45)',
  verticalAlign: 'middle',
};

const tagline: React.CSSProperties = {
  margin: '6px 0 0',
  fontSize: '13px',
  color: GRAY_400,
  letterSpacing: '0.1px',
};

const heroSection: React.CSSProperties = {
  backgroundColor: '#F4F2FE',
  borderTop: `3px solid ${BRAND_PURPLE}`,
  padding: '28px 36px',
};

const heroTitle: React.CSSProperties = {
  margin: '0 0 10px',
  fontSize: '26px',
  fontWeight: '700',
  color: BRAND_DARK,
  letterSpacing: '-0.4px',
  lineHeight: '1.2',
};

const heroSub: React.CSSProperties = {
  margin: '0',
  fontSize: '15px',
  color: '#4B5563',
  lineHeight: '1.7',
};

const content: React.CSSProperties = {
  padding: '32px 36px 28px',
};

const stepsTitle: React.CSSProperties = {
  margin: '0 0 24px',
  fontSize: '11px',
  fontWeight: '600',
  color: GRAY_400,
  textTransform: 'uppercase',
  letterSpacing: '0.8px',
};

const stepRow: React.CSSProperties = {
  marginBottom: '20px',
  paddingBottom: '20px',
  borderBottom: `1px solid ${GRAY_100}`,
};

const stepNum: React.CSSProperties = {
  display: 'inline-block',
  width: '26px',
  height: '26px',
  lineHeight: '26px',
  borderRadius: '50%',
  backgroundColor: BRAND_PURPLE,
  color: WHITE,
  fontSize: '11px',
  fontWeight: '700',
  textAlign: 'center',
};

const stepHeading: React.CSSProperties = {
  margin: '0 0 4px',
  fontSize: '15px',
  fontWeight: '600',
  color: GRAY_800,
  lineHeight: '1.4',
};

const stepDesc: React.CSSProperties = {
  margin: '0',
  fontSize: '13px',
  color: GRAY_600,
  lineHeight: '1.6',
};

const ctaSection: React.CSSProperties = { margin: '32px 0 20px' };

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

const footnote: React.CSSProperties = {
  margin: '0',
  fontSize: '13px',
  color: GRAY_400,
  lineHeight: '1.6',
};

const divider: React.CSSProperties = {
  borderColor: GRAY_100,
  margin: '0 36px',
};

const footer: React.CSSProperties = { padding: '20px 36px 28px' };

const footerText: React.CSSProperties = {
  margin: '0 0 6px',
  fontSize: '12px',
  color: GRAY_400,
  lineHeight: '1.6',
  textAlign: 'center',
};

const footerLink: React.CSSProperties = {
  color: GRAY_600,
  textDecoration: 'underline',
};

const STEPS = [
  {
    num: '01',
    heading: 'Build your Brand Profile',
    desc: 'Tell us your voice, values, and visual identity. This is how we learn to write content that sounds like you.',
  },
  {
    num: '02',
    heading: 'Connect your social accounts',
    desc: 'LinkedIn, Instagram, X, TikTok, Facebook — connect once and we handle publishing.',
  },
  {
    num: '03',
    heading: 'Review generated content',
    desc: 'Your team creates 3 variants of every post. Pick the one that fits best, edit if needed, and approve.',
  },
  {
    num: '04',
    heading: 'Approve and publish',
    desc: 'Publish now or schedule. You get a confirmation when it goes live.',
  },
];

export default function WelcomeEmail({
  userName = 'there',
  appUrl = 'https://app.nativpost.com',
}: WelcomeEmailProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>Welcome to NativPost — studio-crafted content for your brand</Preview>
      <Body style={main}>
        <Container style={container}>

          {/* ── Header ─────────────────────────── */}
          <Section style={header}>
            <Text style={logoText}>
              <span style={logoIcon}>N</span>
              <span style={logoNativ}>Nativ</span>
              <span style={logoPost}>Post</span>
            </Text>
            <Text style={tagline}>Studio-crafted social media content</Text>
          </Section>

          {/* ── Hero ───────────────────────────── */}
          <Section style={heroSection}>
            <Text style={heroTitle}>
              Welcome,
              {' '}
              {userName}
              .
            </Text>
            <Text style={heroSub}>
              You've joined a content studio that works for you — agency-quality
              social media content at a fraction of the cost.
            </Text>
          </Section>

          {/* ── Steps ──────────────────────────── */}
          <Section style={content}>
            <Text style={stepsTitle}>Get started in 4 steps</Text>

            {STEPS.map((step, i) => (
              <table
                key={step.num}
                width="100%"
                cellPadding="0"
                cellSpacing="0"
                style={i < STEPS.length - 1 ? stepRow : { marginBottom: '0' }}
              >
                <tbody>
                  <tr>
                    <td width="40" style={{ verticalAlign: 'top', paddingTop: '1px' }}>
                      <span style={stepNum}>{step.num}</span>
                    </td>
                    <td>
                      <Text style={stepHeading}>{step.heading}</Text>
                      <Text style={stepDesc}>{step.desc}</Text>
                    </td>
                  </tr>
                </tbody>
              </table>
            ))}

            <Section style={ctaSection}>
              <Button href={`${appUrl}/dashboard/brand-profile/onboarding`} style={primaryButton}>
                Build your Brand Profile →
              </Button>
            </Section>

            <Text style={footnote}>
              Takes about 10 minutes. The better your profile, the better your content.
            </Text>
          </Section>

          <Hr style={divider} />

          {/* ── Footer ─────────────────────────── */}
          <Section style={footer}>
            <Text style={footerText}>
              Questions? Reply to this email or reach us at
              {' '}
              <Link href="mailto:support@nativpost.com" style={footerLink}>support@nativpost.com</Link>
            </Text>
            <Text style={footerText}>
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
