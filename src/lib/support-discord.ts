/**
 * src/lib/support-discord.ts
 *
 * Fire-and-forget Discord webhook for in-app feedback submissions.
 * Runs inside waitUntil so it never blocks the response.
 */

import { Env } from '@/libs/Env';

type TicketInfo = {
  id: string;
  subject: string;
  body: string;
  submitterName: string;
  submitterEmail: string;
  source?: string;
};

const NP_GREEN = 0x39ff14;

export async function sendFeedbackToDiscord(ticket: TicketInfo): Promise<void> {
  const webhookUrl = Env.FEEDBACK_DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    return; // not configured — silently skip
  }

  // Derive feedback type from the subject prefix: "[Feedback · Bug] ..."
  let feedbackType = 'Feedback';
  let cleanSubject = ticket.subject;
  const match = ticket.subject.match(/^\[Feedback · (.+?)\]\s*(.*)/);
  if (match) {
    feedbackType = match[1]!;
    cleanSubject = match[2]!;
  }

  const embed = {
    title: `New ${feedbackType} Submission`,
    color: NP_GREEN,
    fields: [
      { name: 'Type', value: feedbackType, inline: true },
      { name: 'From', value: ticket.submitterName, inline: true },
      { name: 'Email', value: ticket.submitterEmail, inline: true },
      { name: 'Ticket', value: `\`${ticket.id}\``, inline: true },
      { name: 'Subject', value: cleanSubject || '(no subject)', inline: false },
      { name: 'Message', value: ticket.body.length > 1000 ? ticket.body.slice(0, 1000) + '…' : ticket.body, inline: false },
    ],
    timestamp: new Date().toISOString(),
    footer: { text: ticket.source === 'in-app feedback' ? 'In-App Feedback' : `Support Ticket · ${ticket.source ?? 'web'}` },
  };

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });
    if (!res.ok) {
      console.warn(`[support-discord] webhook returned ${res.status}`);
    }
  } catch (err) {
    console.warn('[support-discord] webhook failed:', err);
  }
}
