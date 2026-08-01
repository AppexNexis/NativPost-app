/**
 * AI Studio copilot — prompt writing + product Q&A.
 *
 * WHY: AI Studio needs long, well-formed prompts and users were leaving to
 * write them in ChatGPT/Claude, then pasting back. This keeps that loop in the
 * product, grounded in what AI Studio can ACTUALLY do — the live model
 * catalogue, real credit costs, and the aspect ratios each model supports —
 * which a general-purpose chatbot cannot know.
 *
 * Transport mirrors `lib/blitz/apply-brand-voice.ts`: Anthropic first,
 * DeepSeek as fallback. Deliberately the same pattern rather than a second
 * one, so there is a single place to reason about provider failure.
 */

import Anthropic from '@anthropic-ai/sdk';

import { AI_STUDIO_MODELS } from './models';

export type CopilotMode = 'prompt' | 'support';

export type CopilotMessage = {
  role: 'user' | 'assistant';
  content: string;
};

/**
 * A prompt the copilot suggests, shaped so the client can act on it directly
 * rather than making the user copy text. This is the whole point of the
 * feature: the reply ends in a button that fills the composer with the model
 * and aspect ratio preselected. Without it this is ChatGPT with extra steps.
 */
export type CopilotSuggestion = {
  prompt: string;
  modelId: string;
  aspect: string;
  credits: number;
};

export type CopilotReply = {
  message: string;
  suggestion: CopilotSuggestion | null;
  provider: 'anthropic' | 'deepseek' | 'none';
};

const MAX_HISTORY = 8;
const MAX_TOKENS = 700;

/**
 * The catalogue, rendered for the system prompt. Generated from
 * AI_STUDIO_MODELS rather than hardcoded so a new model is available to the
 * copilot the moment it ships — the failure mode we keep hitting elsewhere in
 * this codebase is a second copy of a list that drifts.
 */
function catalogueForPrompt(): string {
  return AI_STUDIO_MODELS
    .map((m) => {
      const parts = [
        `- ${m.id} ("${m.label}") — ${m.kind}, ${m.credits} credits`,
        `aspects: ${m.aspects.join('/')}`,
      ];
      if (m.durations?.length) {
        parts.push(`durations: ${m.durations.join('/')}s`);
      }
      if (m.requiresImage) {
        parts.push('needs a reference image');
      }
      if (m.requiresAudio) {
        parts.push('needs an audio track');
      }
      if (m.description) {
        parts.push(m.description);
      }
      return parts.join(' | ');
    })
    .join('\n');
}

function systemPrompt(mode: CopilotMode, brandContext: string | null): string {
  if (mode === 'support') {
    return `You are NativPost's in-app support assistant.

NativPost is a social media content platform: it generates short-form posts from a library of trending content templates, lets users review them in campaigns, and auto-publishes to Facebook, Instagram, TikTok and YouTube on a schedule. Blitz is the daily-feed mode. AI Studio generates images and video.

Answer the user's question about using NativPost directly and concisely. If you are not certain about a specific behaviour, say so and suggest opening a support ticket rather than guessing — a confident wrong answer about billing or publishing is worse than no answer.

Never invent pricing, limits, or features you were not told about.`;
  }

  return `You help NativPost users write prompts for AI Studio.

AI Studio generates images and video. These are the ONLY models available, with their real credit costs:

${catalogueForPrompt()}

${brandContext ? `The user's brand:\n${brandContext}\n` : ''}
Your job:
1. Turn the user's rough idea into ONE strong, specific generation prompt. Concrete subject, setting, lighting, composition, mood. No preamble, no options list.
2. Pick the most suitable model from the list above and a supported aspect ratio for it. Social-first content is usually 9:16.
3. Keep the prompt under 1500 characters.

Rules:
- Only ever recommend a model id from the list. Never invent one.
- Only use an aspect ratio that model actually supports.
- Mention the credit cost so the user knows what they are spending.
- Never use em dashes or en dashes in the prompt text.

Reply with a short sentence explaining your choice, then the prompt block:

<<<PROMPT
{the prompt}
MODEL: {model id}
ASPECT: {aspect ratio}
PROMPT>>>`;
}

/**
 * Pull the structured suggestion out of the reply and VALIDATE it against the
 * real catalogue. A model id or aspect the model invented would otherwise
 * reach the composer and fail at generation time, which is a worse experience
 * than no suggestion at all.
 */
export function parseSuggestion(text: string): CopilotSuggestion | null {
  const block = text.match(/<<<PROMPT([\s\S]*?)PROMPT>>>/);
  if (!block?.[1]) {
    return null;
  }
  const body = block[1];

  const modelMatch = body.match(/MODEL:\s*([\w.-]+)/i);
  const aspectMatch = body.match(/ASPECT:\s*([\d:]+)/i);
  const prompt = body
    .replace(/MODEL:.*$/im, '')
    .replace(/ASPECT:.*$/im, '')
    .trim();

  if (!prompt) {
    return null;
  }

  const model = AI_STUDIO_MODELS.find(m => m.id === modelMatch?.[1]);
  if (!model) {
    return null;
  }

  const aspect = aspectMatch?.[1] ?? '';
  const validAspect = (model.aspects as readonly string[]).includes(aspect)
    ? aspect
    : model.aspects[0]!;

  return {
    prompt: prompt.slice(0, 1500),
    modelId: model.id,
    aspect: validAspect,
    credits: model.credits,
  };
}

/** Strip the machine-readable block so the chat bubble reads naturally. */
export function stripSuggestionBlock(text: string): string {
  return text.replace(/<<<PROMPT[\s\S]*?PROMPT>>>/g, '').trim();
}

async function callAnthropic(
  system: string,
  messages: CopilotMessage[],
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return null;
  }
  try {
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: MAX_TOKENS,
      system,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    });
    const text = res.content
      .filter(c => c.type === 'text')
      .map(c => (c as { text: string }).text)
      .join('\n')
      .trim();
    return text || null;
  } catch (err) {
    console.warn('[Copilot] Anthropic failed, trying DeepSeek:', (err as Error)?.message);
    return null;
  }
}

async function callDeepSeek(
  system: string,
  messages: CopilotMessage[],
): Promise<string | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return null;
  }
  try {
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        max_tokens: MAX_TOKENS,
        messages: [
          { role: 'system', content: system },
          ...messages.map(m => ({ role: m.role, content: m.content })),
        ],
      }),
    });
    if (!res.ok) {
      console.warn('[Copilot] DeepSeek failed:', res.status);
      return null;
    }
    const data = await res.json() as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.warn('[Copilot] DeepSeek error:', (err as Error)?.message);
    return null;
  }
}

export async function runCopilot({
  mode,
  messages,
  brandContext,
}: {
  mode: CopilotMode;
  messages: CopilotMessage[];
  brandContext?: string | null;
}): Promise<CopilotReply> {
  const system = systemPrompt(mode, brandContext ?? null);
  // Bound the history so a long session can't grow the prompt without limit.
  const trimmed = messages.slice(-MAX_HISTORY);

  let provider: CopilotReply['provider'] = 'anthropic';
  let text = await callAnthropic(system, trimmed);
  if (!text) {
    provider = 'deepseek';
    text = await callDeepSeek(system, trimmed);
  }
  if (!text) {
    return {
      message: 'The assistant is unavailable right now. Please try again in a moment.',
      suggestion: null,
      provider: 'none',
    };
  }

  return {
    message: stripSuggestionBlock(text) || text,
    suggestion: mode === 'prompt' ? parseSuggestion(text) : null,
    provider,
  };
}
