import { Button, Link, Section, Text } from '@react-email/components';
import * as React from 'react';

import {
  APP_ORIGIN,
  BRAND_DARK,
  BRAND_PURPLE,
  callout,
  calloutText,
  content,
  EmailLayout,
  GRAY_600,
  heading,
  paragraph,
  primaryButton,
  strongText,
} from './_theme';

type WelcomeEmailProps = {
  userName: string;
  /** The brand set up during onboarding. Omitted if it isn't known yet. */
  brandName?: string | null;
  appUrl?: string;
};

/**
 * Sent once, when onboarding completes — not at signup. By then the brand
 * profile exists, so the email can name the brand and point at steps the
 * account can actually do, instead of greeting an empty workspace.
 *
 * Written as a personal note from a founder rather than a feature grid: it's
 * the first email a new customer gets, and replies reach a real inbox.
 */

const STEPS = [
  'Open Blitz and generate your first batch of posts',
  'Approve the ones you like, or edit them in the studio',
  'Schedule to TikTok, Instagram, YouTube, LinkedIn and more',
];

const stepList: React.CSSProperties = {
  margin: '0 0 22px',
  padding: '0 0 0 20px',
  fontSize: '15px',
  color: GRAY_600,
  lineHeight: '2',
};

const signOff: React.CSSProperties = {
  margin: '26px 0 0',
  fontSize: '15px',
  color: GRAY_600,
  lineHeight: '1.6',
};

const link: React.CSSProperties = { color: BRAND_PURPLE, fontWeight: '600' };

export default function WelcomeEmail({
  userName = 'there',
  brandName = null,
  appUrl = APP_ORIGIN,
}: WelcomeEmailProps) {
  return (
    <EmailLayout
      preview="Welcome to NativPost — your content studio is ready"
      tagline="Studio-crafted content, on autopilot."
      reason="You're receiving this because you just finished setting up your NativPost workspace."
      appUrl={appUrl}
    >
      <Section style={content}>
        <Text style={heading}>Welcome to NativPost</Text>

        <Text style={paragraph}>
          Hey
          {' '}
          {userName}
          ,
        </Text>

        <Text style={paragraph}>
          Wilson here, one of the founders. We're really glad to have you
          {brandName
            ? (
                <>
                  {' and '}
                  <span style={strongText}>{brandName}</span>
                </>
              )
            : ''}
          {' '}
          on board.
        </Text>

        <Text style={paragraph}>
          NativPost turns your brand into a steady stream of short-form content —
          written in your voice, rendered as finished posts, and published to your
          channels on a schedule. No agency, no editing timeline.
        </Text>

        <Text style={{ ...paragraph, marginBottom: '10px', ...strongText }}>
          Here's how to get your first posts live:
        </Text>
        <ol style={stepList}>
          {STEPS.map(step => <li key={step}>{step}</li>)}
        </ol>

        <Section style={callout}>
          <Text style={calloutText}>
            Your free plan includes a 7-day trial of the full platform — Blitz,
            AI Studio, and direct publishing. No card needed to start.
          </Text>
        </Section>

        <Text style={paragraph}>
          When you're ready, pick the plan that fits — Starter, Growth, or Pro — in
          {' '}
          <Link href={`${appUrl}/dashboard/settings?tab=credits`} style={link}>your billing settings</Link>
          .
        </Text>

        <Text style={paragraph}>
          Questions? Reply to this email, or use the chat widget in the corner of
          your dashboard — it answers most things instantly and can open a ticket
          if it can't.
        </Text>

        <Button href={`${appUrl}/dashboard/blitz`} style={primaryButton}>
          Create your first posts →
        </Button>

        <Text style={signOff}>
          To your growth,
          <br />
          <span style={{ ...strongText, color: BRAND_DARK }}>Wilson and the NativPost team</span>
        </Text>
      </Section>
    </EmailLayout>
  );
}
