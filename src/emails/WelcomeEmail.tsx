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

type WelcomeEmailProps = {
  userName: string;
  appUrl?: string;
};

// ---- Styles ----

const main = {
  backgroundColor: '#F5F5F7',
  fontFamily: '"Inter Tight", system-ui, -apple-system, sans-serif',
};

const container = {
  backgroundColor: '#FFFFFF',
  margin: '32px auto',
  maxWidth: '560px',
  borderRadius: '16px',
  overflow: 'hidden' as const,
  boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
};

const header = {
  backgroundColor: '#0D0D0D',
  padding: '28px 32px 24px',
};

const logo = {
  margin: '0 0 6px 0',
  fontSize: '22px',
  fontWeight: '700',
  letterSpacing: '-0.3px',
};

const logoN = {
  display: 'inline-block',
  backgroundColor: '#864FFE',
  color: '#FFFFFF',
  borderRadius: '6px',
  padding: '2px 7px',
  marginRight: '2px',
  fontSize: '18px',
  fontWeight: '800',
};

const logoText = {
  color: '#FFFFFF',
};

const tagline = {
  margin: '0',
  fontSize: '13px',
  color: '#9CA3AF',
  letterSpacing: '0.1px',
};

const heroSection = {
  backgroundColor: '#F4F2FE',
  borderTop: '3px solid #864FFE',
  padding: '28px 32px',
};

const heroTitle = {
  margin: '0 0 10px 0',
  fontSize: '26px',
  fontWeight: '700',
  color: '#0D0D0D',
  letterSpacing: '-0.4px',
  lineHeight: '1.2',
};

const heroSub = {
  margin: '0',
  fontSize: '15px',
  color: '#4B5563',
  lineHeight: '1.7',
};

const content = {
  padding: '32px 32px 28px',
};

const stepsTitle = {
  margin: '0 0 24px 0',
  fontSize: '13px',
  fontWeight: '600',
  color: '#9CA3AF',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.8px',
};

const stepItem = {
  display: 'flex' as const,
  marginBottom: '20px',
  paddingBottom: '20px',
  borderBottom: '1px solid #F3F4F6',
};

const stepNumber = {
  margin: '0 16px 0 0',
  fontSize: '22px',
  fontWeight: '800',
  color: '#E5E7EB',
  letterSpacing: '-0.5px',
  minWidth: '32px',
  lineHeight: '1.4',
};

const stepText = {
  margin: '0',
  fontSize: '15px',
  color: '#1F2937',
  lineHeight: '1.5',
};

const stepDesc = {
  fontSize: '13px',
  color: '#6B7280',
  lineHeight: '1.6',
};

const ctaSection = {
  margin: '32px 0 16px',
};

const primaryButton = {
  backgroundColor: '#864FFE',
  borderRadius: '8px',
  color: '#FFFFFF',
  fontSize: '15px',
  fontWeight: '600',
  textDecoration: 'none',
  padding: '14px 28px',
  display: 'inline-block',
};

const footnote = {
  margin: '0',
  fontSize: '13px',
  color: '#9CA3AF',
  lineHeight: '1.6',
};

const divider = {
  borderColor: '#F3F4F6',
  margin: '0 32px',
};

const footer = {
  padding: '20px 32px 28px',
};

const footerText = {
  margin: '0 0 6px 0',
  fontSize: '12px',
  color: '#9CA3AF',
  lineHeight: '1.6',
  textAlign: 'center' as const,
};

const footerLink = {
  color: '#6B7280',
  textDecoration: 'underline',
};

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

          {/* Header */}
          <Section style={header}>
            <Text style={logo}>
              <span style={logoN}>N</span>
              <span style={logoText}>ativPost</span>
            </Text>
            <Text style={tagline}>Studio-crafted social media content</Text>
          </Section>

          {/* Hero */}
          <Section style={heroSection}>
            <Text style={heroTitle}>
              Welcome,
              {userName}
              .
            </Text>
            <Text style={heroSub}>
              You've joined a content studio that works for you — agency-quality
              social media content at a fraction of the cost.
            </Text>
          </Section>

          {/* Steps */}
          <Section style={content}>
            <Text style={stepsTitle}>Get started in 4 steps</Text>

            <Section style={stepItem}>
              <Text style={stepNumber}>01</Text>
              <Text style={stepText}>
                <strong>Build your Brand Profile</strong>
                <br />
                <span style={stepDesc}>
                  Tell us your voice, values, and visual identity. This is how we
                  learn to write content that sounds like you.
                </span>
              </Text>
            </Section>

            <Section style={stepItem}>
              <Text style={stepNumber}>02</Text>
              <Text style={stepText}>
                <strong>Connect your social accounts</strong>
                <br />
                <span style={stepDesc}>
                  LinkedIn, Instagram, X, Facebook — connect once and we handle publishing.
                </span>
              </Text>
            </Section>

            <Section style={stepItem}>
              <Text style={stepNumber}>03</Text>
              <Text style={stepText}>
                <strong>Review generated content</strong>
                <br />
                <span style={stepDesc}>
                  Your team creates 3 variants of every post. You pick the one that
                  fits best, edit if needed, and approve.
                </span>
              </Text>
            </Section>

            <Section style={stepItem}>
              <Text style={stepNumber}>04</Text>
              <Text style={stepText}>
                <strong>Approve and publish</strong>
                <br />
                <span style={stepDesc}>
                  We publish on your schedule. You get a confirmation when it goes live.
                </span>
              </Text>
            </Section>

            <Section style={ctaSection}>
              <Button href={`${appUrl}/dashboard/brand-profile/onboarding`} style={primaryButton}>
                Build your Brand Profile
              </Button>
            </Section>

            <Text style={footnote}>
              Takes about 10 minutes. The better your profile, the better your content.
            </Text>
          </Section>

          <Hr style={divider} />

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              Questions? Reply to this email or reach us at
              {' '}
              <Link href="mailto:support@nativpost.com" style={footerLink}>
                support@nativpost.com
              </Link>
            </Text>
            <Text style={footerText}>
              <Link href="https://nativpost.com" style={footerLink}>
                NativPost
              </Link>
              {' · A product of '}
              <Link href="https://www.appexnexis.site/" style={footerLink}>
                AppexNexis LTD
              </Link>
            </Text>
          </Section>

        </Container>
      </Body>
    </Html>
  );
}
