/**
 * src/app/api/support/tickets/[id]/stream/route.ts
 *
 * POST /api/support/tickets/:id/stream
 *
 * Streams Claude's response token by token using Server-Sent Events.
 * The client opens this connection immediately after sending a reply
 * and reads tokens as they arrive — exactly like ChatGPT or Claude.
 *
 * Flow:
 * 1. Client sends reply to /reply (saves message to DB)
 * 2. Client opens SSE connection to /stream
 * 3. This route streams Claude's response directly to the browser
 * 4. When stream ends, the complete response is saved to DB
 * 5. Client receives a final SSE event with the saved message ID
 */

import Anthropic from '@anthropic-ai/sdk';
import { auth } from '@clerk/nextjs/server';
import { and, asc, eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';

import { getDb } from '@/libs/DB';
import {
  knowledgeArticleSchema,
  supportMessageSchema,
  supportTicketSchema,
} from '@/models/Schema';

export const dynamic = 'force-dynamic';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a support specialist for NativPost, an AI-powered social media management platform.

NativPost helps small businesses and agencies create, schedule, and publish social media content across Instagram, LinkedIn, X (Twitter), Facebook, and TikTok. Core features:
- Brand Profile Builder: captures brand voice, tone, visual identity, and content preferences
- AI Content Generation: creates on-brand captions and post variants
- Content Calendar: plans and schedules posts monthly
- Approval Workflow: clients approve or reject AI-generated content before publishing
- Analytics: tracks engagement, reach, and performance
- Social Connections: OAuth integration with all major platforms

Plans:
- Starter: $19/mo, 20 posts/month, 3 platforms
- Growth: $49/mo, 40 posts/month, 5 platforms
- Pro: $99/mo, 80 posts/month, all platforms
- Enterprise: custom pricing, unlimited posts, white-label

Payments: Stripe (international), Paystack (African markets).

Instructions:
- Be warm, clear, and concise. Never use filler phrases or corporate speak.
- Address the client by name when you know it.
- If you can fully resolve the issue, do so. End with a brief check-in question.
- If the issue requires account investigation, billing action, or a human decision, say so clearly and tell them the team will follow up.
- Never invent account-specific details you do not have.
- Keep replies under 200 words unless the issue is complex.
- Do not use bullet points unless listing steps. Prefer natural prose.
- Sign off as: The NativPost Support Team`;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: RouteContext) {
  const { userId, orgId } = await auth();

  if (!userId || !orgId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id } = await params;
  const db = await getDb();

  // Verify ticket ownership
  const [ticket] = await db
    .select()
    .from(supportTicketSchema)
    .where(eq(supportTicketSchema.id, id));

  if (!ticket || ticket.orgId !== orgId) {
    return new Response('Not found', { status: 404 });
  }

  // Fetch full conversation history for context
  const allMessages = await db
    .select({
      authorType: supportMessageSchema.authorType,
      authorName: supportMessageSchema.authorName,
      body:       supportMessageSchema.body,
    })
    .from(supportMessageSchema)
    .where(
      and(
        eq(supportMessageSchema.ticketId, id),
        eq(supportMessageSchema.isInternal, false),
      ),
    )
    .orderBy(asc(supportMessageSchema.createdAt));

  // Fetch KB articles for context
  const articles = await db
    .select({ title: knowledgeArticleSchema.title, body: knowledgeArticleSchema.body })
    .from(knowledgeArticleSchema)
    .where(
      and(
        eq(knowledgeArticleSchema.isPublished, true),
        eq(knowledgeArticleSchema.isInternal, false),
      ),
    )
    .limit(4);

  const kbContext = articles.length > 0
    ? `\n\nKNOWLEDGE BASE:\n${articles.map((a) => `## ${a.title}\n${a.body}`).join('\n\n---\n\n')}`
    : '';

  // Build conversation in Claude's message format
  // Group consecutive messages from the same side together
  const claudeMessages: { role: 'user' | 'assistant'; content: string }[] = [];

  for (const msg of allMessages) {
    const role: 'user' | 'assistant' = msg.authorType === 'client' ? 'user' : 'assistant';
    const last = claudeMessages[claudeMessages.length - 1];

    if (last && last.role === role) {
      // Append to existing message rather than creating a new turn
      last.content += `\n\n${msg.body}`;
    } else {
      claudeMessages.push({ role, content: msg.body });
    }
  }

  // Claude requires conversations to start with a user message
  // and alternate roles. If somehow it starts with assistant, prepend context.
  if (claudeMessages.length === 0 || claudeMessages[0]?.role !== 'user') {
    claudeMessages.unshift({
      role: 'user',
      content: `Support ticket subject: ${ticket.subject}`,
    });
  }

  // Stream Claude's response as SSE
  const encoder = new TextEncoder();
  let fullResponse = '';

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: string) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      try {
        const claudeStream = client.messages.stream({
          model:      'claude-sonnet-4-20250514',
          max_tokens: 512,
          system:     SYSTEM_PROMPT + kbContext,
          messages:   claudeMessages,
        });

        // Stream each text token to the client as it arrives
        for await (const chunk of claudeStream) {
          if (
            chunk.type === 'content_block_delta'
            && chunk.delta.type === 'text_delta'
          ) {
            const text = chunk.delta.text;
            fullResponse += text;
            send('token', text);
          }
        }

        // Save the complete response to DB
        const [saved] = await db
          .insert(supportMessageSchema)
          .values({
            ticketId:   id,
            authorType: 'ai',
            authorName: 'NativPost Support',
            body:       fullResponse,
            isInternal: false,
          })
          .returning({ id: supportMessageSchema.id, createdAt: supportMessageSchema.createdAt });

        // Tell the client the message is saved (includes ID and timestamp)
        send('done', JSON.stringify({ messageId: saved?.id, createdAt: saved?.createdAt }));
      } catch (err) {
        console.error('[stream] Claude streaming error:', err);
        send('error', 'Something went wrong. Our team has been notified.');

        // Fallback — save a plain acknowledgment
        try {
          await db.insert(supportMessageSchema).values({
            ticketId:   id,
            authorType: 'ai',
            authorName: 'NativPost Support',
            body:       `Thank you for your message. A member of our team will review this and respond shortly.\n\nThe NativPost Support Team`,
            isInternal: false,
          });
        } catch {
          // Silent
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no', // Disable Nginx buffering on Vercel
    },
  });
}