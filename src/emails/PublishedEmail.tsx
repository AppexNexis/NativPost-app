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

type PublishedEmailProps = {
  brandName: string;
  platforms: string;
  caption: string;
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

const successBanner = {
  backgroundColor: '#F4F2FE',
  borderTop: '3px solid #864FFE',
  padding: '24px 32px',
};

const successTitle = {
  margin: '0 0 6px 0',
  fontSize: '20px',
  fontWeight: '700',
  color: '#864FFE',
  letterSpacing: '-0.2px',
};

const successSub = {
  margin: '0',
  fontSize: '15px',
  color: '#4B5563',
  lineHeight: '1.6',
};

const content = {
  padding: '28px 32px',
};

const sectionLabel = {
  margin: '0 0 10px 0',
  fontSize: '11px',
  fontWeight: '600',
  color: '#9CA3AF',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.8px',
};

const captionBox = {
  backgroundColor: '#FAFAFA',
  border: '1px solid #E5E7EB',
  borderRadius: '10px',
  padding: '16px 20px',
  marginBottom: '28px',
};

const captionText = {
  margin: '0',
  fontSize: '14px',
  color: '#374151',
  lineHeight: '1.7',
};

const ctaSection = {
  display: 'flex' as const,
  gap: '12px',
};

const primaryButton = {
  backgroundColor: '#864FFE',
  borderRadius: '8px',
  color: '#FFFFFF',
  fontSize: '14px',
  fontWeight: '600',
  textDecoration: 'none',
  padding: '12px 22px',
  display: 'inline-block',
  marginRight: '10px',
};

const secondaryButton = {
  backgroundColor: '#F3F4F6',
  borderRadius: '8px',
  color: '#1F2937',
  fontSize: '14px',
  fontWeight: '500',
  textDecoration: 'none',
  padding: '12px 22px',
  display: 'inline-block',
  border: '1px solid #E5E7EB',
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

export default function PublishedEmail({
  brandName = 'Your Brand',
  platforms = 'LinkedIn',
  caption = '',
  appUrl = 'https://app.nativpost.com',
}: PublishedEmailProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>
        Your post is live on
        {platforms}
        {' '}
        —
        {brandName}
      </Preview>
      <Body style={main}>
        <Container style={container}>

          {/* Header */}
          <Section style={header}>
            <Text style={logo}>
              <span style={logoN}>N</span>
              <span style={logoText}>ativPost</span>
            </Text>
            <Text style={tagline}>Studio-crafted content, published.</Text>
          </Section>

          {/* Status banner */}
          <Section style={successBanner}>
            <Text style={successTitle}>Post published ✓</Text>
            <Text style={successSub}>
              Your content for
              {' '}
              <strong>{brandName}</strong>
              {' '}
              is now live on
              {' '}
              <strong>{platforms}</strong>
              .
            </Text>
          </Section>

          {/* Caption preview */}
          <Section style={content}>
            <Text style={sectionLabel}>What went live</Text>
            <Section style={captionBox}>
              <Text style={captionText}>
                {caption.length > 280 ? `${caption.substring(0, 280)}...` : caption}
              </Text>
            </Section>

            <Section style={ctaSection}>
              <Button href={`${appUrl}/dashboard/analytics`} style={primaryButton}>
                View analytics
              </Button>
              <Button href={`${appUrl}/dashboard/posts`} style={secondaryButton}>
                See all posts
              </Button>
            </Section>
          </Section>

          <Hr style={divider} />

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              You're receiving this because a post was published on your NativPost account.
            </Text>
            <Text style={footerText}>
              <Link href={`${appUrl}/dashboard/settings`} style={footerLink}>
                Manage notifications
              </Link>
              {' · '}
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
