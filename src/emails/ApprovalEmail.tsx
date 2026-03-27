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

const badgeSection = {
  backgroundColor: '#FFFBEB',
  borderTop: '3px solid #F59E0B',
  padding: '16px 32px',
};

const badge = {
  margin: '0',
  fontSize: '13px',
  fontWeight: '600',
  color: '#92400E',
  letterSpacing: '0.1px',
};

const content = {
  padding: '32px 32px 28px',
};

const heading = {
  margin: '0 0 16px 0',
  fontSize: '22px',
  fontWeight: '700',
  color: '#0D0D0D',
  letterSpacing: '-0.3px',
  lineHeight: '1.3',
};

const paragraph = {
  margin: '0 0 16px 0',
  fontSize: '15px',
  color: '#4B5563',
  lineHeight: '1.7',
};

const ctaSection = {
  margin: '28px 0',
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

const infoBox = {
  backgroundColor: '#FAFAFA',
  border: '1px solid #E5E7EB',
  borderRadius: '10px',
  padding: '18px 20px',
};

const infoTitle = {
  margin: '0 0 12px 0',
  fontSize: '13px',
  fontWeight: '600',
  color: '#374151',
};

const infoItem = {
  margin: '0 0 8px 0',
  fontSize: '13px',
  color: '#6B7280',
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

export default function ApprovalEmail({
  brandName = 'Your Brand',
  contentCount = 1,
  appUrl = 'https://app.nativpost.com',
}: ApprovalEmailProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>
        {`${contentCount} new post${contentCount > 1 ? 's' : ''} ready for your approval — ${brandName}`}
      </Preview>
      <Body style={main}>
        <Container style={container}>

          {/* Header */}
          <Section style={header}>
            <Text style={logo}>
              <span style={logoN}>N</span>
              <span style={logoText}>ativPost</span>
            </Text>
            <Text style={tagline}>Your content studio</Text>
          </Section>

          {/* Badge */}
          <Section style={badgeSection}>
            <Text style={badge}>
              {contentCount}
              {' '}
              post
              {contentCount > 1 ? 's' : ''}
              {' '}
              awaiting review
            </Text>
          </Section>

          {/* Main content */}
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
                {' '}
                new post
                {contentCount > 1 ? 's' : ''}
              </strong>
              {' '}
              for
              {' '}
              <strong>{brandName}</strong>
              . Each piece has been reviewed for
              brand alignment, quality, and platform optimisation.
            </Text>
            <Text style={paragraph}>
              Take a look, make any edits you'd like, and approve the ones you
              want to go live. Your team handles the rest.
            </Text>

            <Section style={ctaSection}>
              <Button href={`${appUrl}/dashboard/approvals`} style={primaryButton}>
                Review content now
              </Button>
            </Section>

            <Section style={infoBox}>
              <Text style={infoTitle}>What happens after you approve?</Text>
              <Text style={infoItem}>→ Approved posts are scheduled for publishing</Text>
              <Text style={infoItem}>→ Your team publishes at the optimal time</Text>
              <Text style={infoItem}>→ You get a confirmation email when it goes live</Text>
            </Section>
          </Section>

          <Hr style={divider} />

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              You're receiving this because you have pending approvals on NativPost.
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
