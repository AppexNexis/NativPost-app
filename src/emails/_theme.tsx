/**
 * Shared design system for every NativPost transactional email.
 *
 * Each template used to carry its own copy of the palette, the header and the
 * footer. Four copies of the same tokens drift — they already had different
 * greys and three different footers. Tokens and chrome live here now, so a
 * brand change is one edit rather than four.
 *
 * Email CSS constraints that shape everything below:
 *   - Inline styles only. No <style> blocks, no classes, no CSS variables —
 *     Gmail strips them.
 *   - No flexbox or grid. Layout is tables or stacked blocks.
 *   - Images must be absolute, hosted, and raster. Outlook and Gmail will not
 *     render SVG, so the logo is the PNG already served from /public.
 *   - Always set an explicit width/height on images: several clients reserve
 *     no space otherwise and the layout jumps as it loads.
 */

import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

export const APP_ORIGIN = 'https://app.nativpost.com';

// ── Platform names ─────────────────────────────────────────────────────────
// Internal keys are lowercase ('tiktok'); customers should never see those in
// an email. Shared so the templates can't disagree — they already did, with
// one showing "TikTok" and another "tiktok" for the same post.
const PLATFORM_LABELS: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  threads: 'Threads',
  tiktok: 'TikTok',
  twitter: 'X',
  youtube: 'YouTube',
};

export function platformLabel(platform: string): string {
  const key = platform.trim().toLowerCase();
  return PLATFORM_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

/** Humanise an already-joined channel list, e.g. "tiktok, instagram". */
export function humanisePlatforms(platforms: string): string {
  return platforms
    .split(',')
    .map(p => p.trim())
    .filter(Boolean)
    .map(platformLabel)
    .join(', ');
}

// ── Palette ────────────────────────────────────────────────────────────────
// Mirrors the app's design tokens. Kept as plain hex because email clients
// don't support CSS variables and several choke on oklch()/hsl() shorthand.
export const BRAND_PURPLE = '#864FFE';
export const BRAND_PURPLE_DARK = '#6D3AE0';
export const BRAND_PURPLE_TINT = '#F4F2FE';
export const BRAND_DARK = '#1A1A1C';
export const GRAY_50 = '#F5F5F7';
export const GRAY_100 = '#F3F4F6';
export const GRAY_200 = '#E5E7EB';
export const GRAY_400 = '#9CA3AF';
export const GRAY_500 = '#6B7280';
export const GRAY_600 = '#4B5563';
export const GRAY_700 = '#374151';
export const WHITE = '#FFFFFF';

export const FONT_STACK
  = '"DM Sans", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';

// ── Base surfaces ──────────────────────────────────────────────────────────
export const main: React.CSSProperties = {
  backgroundColor: GRAY_50,
  fontFamily: FONT_STACK,
  margin: '0',
  padding: '24px 16px',
};

export const container: React.CSSProperties = {
  backgroundColor: WHITE,
  margin: '0 auto',
  maxWidth: '560px',
  borderRadius: '16px',
  overflow: 'hidden',
  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  border: `1px solid ${GRAY_200}`,
};

export const content: React.CSSProperties = { padding: '28px 36px' };

// ── Typography ─────────────────────────────────────────────────────────────
export const heading: React.CSSProperties = {
  margin: '0 0 8px',
  fontSize: '22px',
  fontWeight: '700',
  color: BRAND_DARK,
  letterSpacing: '-0.3px',
  lineHeight: '1.3',
};

export const paragraph: React.CSSProperties = {
  margin: '0 0 16px',
  fontSize: '15px',
  color: GRAY_600,
  lineHeight: '1.65',
};

export const sectionLabel: React.CSSProperties = {
  margin: '0 0 10px',
  fontSize: '11px',
  fontWeight: '600',
  color: GRAY_400,
  textTransform: 'uppercase',
  letterSpacing: '0.8px',
};

export const strongText: React.CSSProperties = { color: BRAND_DARK, fontWeight: '600' };

// ── Buttons ────────────────────────────────────────────────────────────────
export const primaryButton: React.CSSProperties = {
  backgroundColor: BRAND_PURPLE,
  borderRadius: '8px',
  color: WHITE,
  fontSize: '15px',
  fontWeight: '600',
  textDecoration: 'none',
  padding: '13px 26px',
  display: 'inline-block',
  marginRight: '10px',
};

export const secondaryButton: React.CSSProperties = {
  backgroundColor: GRAY_100,
  borderRadius: '8px',
  color: BRAND_DARK,
  fontSize: '15px',
  fontWeight: '500',
  textDecoration: 'none',
  padding: '13px 26px',
  display: 'inline-block',
  border: `1px solid ${GRAY_200}`,
};

// ── Callout (the tinted "note" band) ───────────────────────────────────────
export const callout: React.CSSProperties = {
  backgroundColor: BRAND_PURPLE_TINT,
  borderLeft: `3px solid ${BRAND_PURPLE}`,
  borderRadius: '0 10px 10px 0',
  padding: '14px 18px',
  marginBottom: '24px',
};

export const calloutText: React.CSSProperties = {
  margin: '0',
  fontSize: '14px',
  color: GRAY_700,
  lineHeight: '1.6',
  fontWeight: '500',
};

// ── Quoted caption block ───────────────────────────────────────────────────
export const captionBox: React.CSSProperties = {
  backgroundColor: '#FAFAFA',
  border: `1px solid ${GRAY_200}`,
  borderLeft: `3px solid ${BRAND_PURPLE}`,
  borderRadius: '0 10px 10px 0',
  padding: '16px 20px',
  marginBottom: '28px',
};

export const captionText: React.CSSProperties = {
  margin: '0',
  fontSize: '14px',
  color: GRAY_700,
  lineHeight: '1.7',
  fontStyle: 'italic',
};

// ── Header / footer chrome ─────────────────────────────────────────────────
const header: React.CSSProperties = {
  backgroundColor: BRAND_DARK,
  padding: '28px 36px 24px',
};

const wordmark: React.CSSProperties = {
  margin: '14px 0 0',
  fontSize: '22px',
  fontWeight: '700',
  letterSpacing: '-0.5px',
  lineHeight: '1',
};

const wordmarkNativ: React.CSSProperties = { color: WHITE };
const wordmarkPost: React.CSSProperties = { color: 'rgba(255,255,255,0.45)' };

const tagline: React.CSSProperties = {
  margin: '6px 0 0',
  fontSize: '13px',
  color: GRAY_400,
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

const footerLink: React.CSSProperties = { color: GRAY_500, textDecoration: 'underline' };

/**
 * The shell every email renders inside: <head>, preview text, brand header,
 * body, and the legal/unsubscribe footer.
 *
 * `reason` states why this specific email arrived. Worth varying per template
 * — a vague "you have an account with us" is what gets mail marked as spam.
 */
export function EmailLayout({
  preview,
  tagline: taglineText = 'Studio-crafted content, on autopilot.',
  reason,
  appUrl = APP_ORIGIN,
  children,
}: {
  preview: string;
  tagline?: string;
  reason: string;
  appUrl?: string;
  children: React.ReactNode;
}) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            {/* Absolute URL to the PNG in /public — email clients cannot
                resolve relative paths and will not render SVG. */}
            <Img
              src={`${appUrl}/apple-touch-icon.png`}
              width="44"
              height="44"
              alt="NativPost"
              style={{ display: 'block', borderRadius: '50%' }}
            />
            <Text style={wordmark}>
              <span style={wordmarkNativ}>Nativ</span>
              <span style={wordmarkPost}>Post</span>
            </Text>
            <Text style={tagline}>{taglineText}</Text>
          </Section>

          {children}

          <Hr style={divider} />

          <Section style={footer}>
            <Text style={footerText}>{reason}</Text>
            <Text style={footerText}>
              <Link href={`${appUrl}/dashboard/settings`} style={footerLink}>
                Manage notifications
              </Link>
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
