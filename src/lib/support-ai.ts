/**
 * src/lib/support-ai.ts
 *
 * AI-powered support ticket processing using the Anthropic Claude API.
 *
 * Functions:
 * - classifyTicket        → category + priority + summary
 * - generateAutoReply     → attempt fully automated response from KB
 * - polishAgentReply      → improve agent draft while preserving intent
 * - suggestKBArticles     → find relevant knowledge base articles
 */

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// -----------------------------------------------------------
// TYPES
// -----------------------------------------------------------
export type TicketCategory =
  | 'billing'
  | 'content_generation'
  | 'social_connection'
  | 'analytics'
  | 'account'
  | 'technical'
  | 'other';

export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';

export type ClassificationResult = {
  category: TicketCategory;
  priority: TicketPriority;
  summary: string;           // 1-2 sentence summary for agent queue
  confidence: number;        // 0-1
  suggestedAutoReply: boolean; // true if AI thinks it can auto-resolve
};

export type AutoReplyResult = {
  canResolve: boolean;
  reply: string | null;      // null if canResolve is false
  confidence: number;        // 0-1
  reasonIfNot?: string;      // why it can't auto-resolve
};

export type PolishResult = {
  polishedReply: string;
  changesMade: string;       // brief description of what was changed
};

// -----------------------------------------------------------
// NATIVPOST SYSTEM CONTEXT
// This is injected into every support AI call so the model
// understands the product it's supporting.
// -----------------------------------------------------------
const NATIVPOST_CONTEXT = `You are a support specialist for NativPost, an AI-powered social media management platform.

NativPost helps small businesses and agencies create, schedule, and publish social media content across Instagram, LinkedIn, X (Twitter), Facebook, and TikTok. The core product features are:
- Brand Profile Builder: captures a brand's voice, tone, visual identity, and content preferences
- AI Content Generation: creates on-brand social media captions and post variants using Claude AI
- Content Calendar: plans and schedules posts monthly
- Approval Workflow: clients approve or reject AI-generated content before it goes live
- Analytics: tracks engagement, reach, and performance across connected platforms
- Social Connections: OAuth integration with all major social platforms

Plans:
- Starter: $19/mo, 20 posts/month, 3 platforms, $29 setup fee
- Growth: $49/mo, 40 posts/month, 5 platforms, $79 setup fee  
- Pro: $99/mo, 80 posts/month, all platforms, $149 setup fee
- Enterprise: custom pricing, unlimited posts, white-label option

Payments: Stripe for international, Paystack for Nigerian/African markets.
Support app: app.nativpost.com
Marketing site: nativpost.com`;

// -----------------------------------------------------------
// CLASSIFY TICKET
// Called immediately when a new ticket is created.
// -----------------------------------------------------------
export async function classifyTicket(
  subject: string,
  body: string,
): Promise<ClassificationResult> {
  const prompt = `${NATIVPOST_CONTEXT}

---

A new support ticket has been submitted. Analyse it and return a JSON object.

Ticket subject: ${subject}

Ticket body:
${body}

Return ONLY a valid JSON object with this exact shape (no markdown, no explanation):
{
  "category": "<one of: billing | content_generation | social_connection | analytics | account | technical | other>",
  "priority": "<one of: low | medium | high | urgent>",
  "summary": "<1-2 sentence plain English summary of the issue for the agent queue>",
  "confidence": <number 0-1>,
  "suggestedAutoReply": <true if this is a simple FAQ-style question the AI could answer fully, false if it needs human attention>
}

Priority guide:
- urgent: payment failed, account locked, data loss, production outage
- high: can't publish, connected account broken, billing dispute
- medium: feature questions, general troubleshooting, slow performance
- low: general questions, feature requests, feedback

Return ONLY the JSON. No other text.`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    return {
      category: parsed.category ?? 'other',
      priority: parsed.priority ?? 'medium',
      summary: parsed.summary ?? subject,
      confidence: parsed.confidence ?? 0.5,
      suggestedAutoReply: parsed.suggestedAutoReply ?? false,
    };
  } catch (err) {
    console.error('[support-ai] classifyTicket failed:', err);
    return {
      category: 'other',
      priority: 'medium',
      summary: subject,
      confidence: 0,
      suggestedAutoReply: false,
    };
  }
}

// -----------------------------------------------------------
// GENERATE AUTO REPLY
// Attempts to fully answer the ticket from product knowledge.
// Only called when classifyTicket returns suggestedAutoReply: true.
// -----------------------------------------------------------
export async function generateAutoReply(
  subject: string,
  body: string,
  clientName: string,
  kbContext: string,
): Promise<AutoReplyResult> {
  const prompt = `${NATIVPOST_CONTEXT}

---

You are handling a customer support ticket. Below are relevant knowledge base articles to help you answer it.

KNOWLEDGE BASE:
${kbContext || 'No specific articles found — use general product knowledge.'}

---

CUSTOMER: ${clientName}
SUBJECT: ${subject}
MESSAGE:
${body}

---

Your task: Write a complete, helpful reply that fully resolves this ticket if possible.

Rules:
1. Be warm, clear, and concise. Address ${clientName} by name.
2. If you can fully answer the question, do so. End with: "Does this resolve your issue? If not, reply and a member of our team will step in."
3. If this requires account-specific investigation, billing action, or human judgement — say so and set canResolve to false.
4. Never make up specific account details you don't have.
5. Keep replies under 250 words.
6. Sign off as: "The NativPost Support Team"

Return ONLY a valid JSON object (no markdown, no extra text):
{
  "canResolve": <true | false>,
  "reply": "<full reply text, or null if canResolve is false>",
  "confidence": <number 0-1>,
  "reasonIfNot": "<brief reason why human is needed, or null>"
}`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    return {
      canResolve: parsed.canResolve ?? false,
      reply: parsed.reply ?? null,
      confidence: parsed.confidence ?? 0.5,
      reasonIfNot: parsed.reasonIfNot,
    };
  } catch (err) {
    console.error('[support-ai] generateAutoReply failed:', err);
    return { canResolve: false, reply: null, confidence: 0, reasonIfNot: 'AI processing error' };
  }
}

// -----------------------------------------------------------
// POLISH AGENT REPLY
// Takes an agent's draft and improves it without changing the intent.
// Called when an agent clicks "AI Polish" before sending.
// -----------------------------------------------------------
export async function polishAgentReply(
  draft: string,
  ticketContext: { subject: string; clientName: string },
): Promise<PolishResult> {
  const prompt = `${NATIVPOST_CONTEXT}

---

A support agent has written a draft reply to a customer ticket. Your job is to polish it — improve clarity, tone, and professionalism — without changing the core message or adding information the agent didn't include.

Ticket subject: ${ticketContext.subject}
Customer name: ${ticketContext.clientName}
Agent draft:
${draft}

Rules:
1. Keep the same meaning and all the same information
2. Fix grammar, spelling, and punctuation
3. Make the tone warm and professional — like a knowledgeable friend, not a robot
4. Keep it concise — don't add fluff or filler phrases
5. Do NOT add information not in the original draft
6. Sign off naturally — match whatever sign-off the agent used

Return ONLY a valid JSON object (no markdown, no extra text):
{
  "polishedReply": "<the improved reply text>",
  "changesMade": "<brief description of what you changed, e.g. 'Fixed 2 grammar issues, improved opening sentence, made tone warmer'>"
}`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    return {
      polishedReply: parsed.polishedReply ?? draft,
      changesMade: parsed.changesMade ?? 'No significant changes',
    };
  } catch (err) {
    console.error('[support-ai] polishAgentReply failed:', err);
    return { polishedReply: draft, changesMade: 'Polish failed — original preserved' };
  }
}

// -----------------------------------------------------------
// SUMMARISE LONG TICKET
// For very long tickets, generate a tl;dr for the agent queue.
// -----------------------------------------------------------
export async function summariseTicket(body: string): Promise<string> {
  if (body.length < 400) return body; // Short enough already

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `Summarise this support ticket in 1-2 sentences for an agent queue. Be factual and specific. No fluff.\n\n${body}`,
      }],
    });

    return response.content[0]?.type === 'text'
      ? response.content[0].text.trim()
      : body.slice(0, 300) + '...';
  } catch {
    return body.slice(0, 300) + '...';
  }
}