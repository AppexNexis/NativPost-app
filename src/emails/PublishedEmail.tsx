import { Button, Link, Section, Text } from '@react-email/components';
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
  GRAY_100,
  GRAY_500,
  GRAY_600,
  humanisePlatforms,
  platformLabel,
  primaryButton,
  secondaryButton,
  sectionLabel,
  strongText,
  WHITE,
} from './_theme';

/** One account the post actually landed on. */
export type PublishedTarget = {
  platform: string;
  /** Handle/page name. Null when the connection never stored one. */
  accountName?: string | null;
  /** Direct link to the live post, when the platform returns one. */
  permalink?: string | null;
};

type PublishedEmailProps = {
  brandName: string;
  platforms: string;
  caption: string;
  appUrl?: string;
  /**
   * Per-account detail. Optional: `platforms` remains the fallback so an older
   * caller that only has the joined channel string still renders correctly.
   */
  targets?: PublishedTarget[];
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

const targetRow: React.CSSProperties = {
  borderBottom: `1px solid ${GRAY_100}`,
  padding: '11px 0',
};

const targetPlatform: React.CSSProperties = {
  margin: '0',
  fontSize: '13px',
  fontWeight: '600',
  color: BRAND_DARK,
};

const targetAccount: React.CSSProperties = {
  margin: '2px 0 0',
  fontSize: '13px',
  color: GRAY_500,
};

const targetLink: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: '600',
  color: BRAND_PURPLE,
  textDecoration: 'none',
};

export default function PublishedEmail({
  brandName = 'Your Brand',
  platforms = 'LinkedIn',
  caption = '',
  appUrl = APP_ORIGIN,
  targets = [],
}: PublishedEmailProps) {
  // Prefer real account names over the bare channel list: "@acme (TikTok)"
  // tells you which of your three TikTok accounts posted; "tiktok" does not.
  const named = targets.filter(t => t.accountName);
  const summary = named.length > 0
    ? named.map(t => `${t.accountName} (${platformLabel(t.platform)})`).join(', ')
    : humanisePlatforms(platforms);

  return (
    <EmailLayout
      preview={`Your post is live on ${humanisePlatforms(platforms)} — ${brandName}`}
      tagline="Studio-crafted content, on autopilot."
      reason="You're receiving this because a post was published on your NativPost account."
      appUrl={appUrl}
    >
      <Section style={banner}>
        <span style={badge}>Published ✓</span>
        <Text style={title}>Your post is live</Text>
        <Text style={sub}>
          {'Content for '}
          <span style={strongText}>{brandName}</span>
          {' is now live on '}
          <span style={strongText}>{summary}</span>
          .
        </Text>
      </Section>

      <Section style={content}>
        <Text style={sectionLabel}>What went live</Text>
        <Section style={captionBox}>
          <Text style={captionText}>
            {caption.length > 280 ? `${caption.substring(0, 280)}…` : caption}
          </Text>
        </Section>

        {/* Where it landed, one row per account, each linking to the live post.
            Platforms that don't return a permalink (some TikTok and Instagram
            responses) still get a row — knowing which account it posted to is
            useful even without the deep link. */}
        {targets.length > 0 && (
          <>
            <Text style={sectionLabel}>Published to</Text>
            <Section style={{ marginBottom: '28px' }}>
              {targets.map(t => (
                <Section key={`${t.platform}-${t.accountName ?? ''}`} style={targetRow}>
                  <Text style={targetPlatform}>{platformLabel(t.platform)}</Text>
                  {t.accountName && <Text style={targetAccount}>{t.accountName}</Text>}
                  {t.permalink && (
                    <Link href={t.permalink} style={targetLink}>
                      View post →
                    </Link>
                  )}
                </Section>
              ))}
            </Section>
          </>
        )}

        <Button href={`${appUrl}/dashboard/analytics`} style={primaryButton}>
          View analytics →
        </Button>
        <Button href={`${appUrl}/dashboard/posts`} style={secondaryButton}>
          See all posts
        </Button>
      </Section>
    </EmailLayout>
  );
}
