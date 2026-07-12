/**
 * generateContentAnglesFromProfile
 *
 * Turns a freshly-extracted brand profile into 5 content angles the user
 * can immediately use to seed their calendar. Runs after the website scrape
 * (or as a manual pass over a description-mode profile) so the "Done" step
 * of the onboarding wizard has real angles to show, not an empty state.
 *
 * Failures are non-fatal - the wizard falls back to an empty angle list and
 * the user can add angles by hand in the dashboard later.
 */

import Anthropic from '@anthropic-ai/sdk';

export type ContentAngleDraft = {
  name: string;
  description: string;
  targetAudience: string;
};

export type BrandProfileForAngles = {
  brandName?: string | null;
  industry?: string | null;
  targetAudience?: string | null;
  companyDescription?: string | null;
  values?: unknown;
  productsServices?: unknown;
  keyDifferentiators?: string | null;
  communicationStyle?: string | null;
  mission?: string | null;
};

function asStringList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map(item => item.trim());
}

function safeJsonParseArray(raw: string): ContentAngleDraft[] {
  const trimmed = raw.trim();

  // Handle fenced code blocks Claude sometimes wraps JSON in.
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenceMatch?.[1] ?? trimmed;

  // Find the first [ and matching last ] so any prose framing is ignored.
  const start = candidate.indexOf('[');
  const end = candidate.lastIndexOf(']');
  const jsonSlice = start !== -1 && end !== -1 ? candidate.slice(start, end + 1) : candidate;

  try {
    const parsed = JSON.parse(jsonSlice);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item): ContentAngleDraft | null => {
        if (!item || typeof item !== 'object') return null;
        const name = typeof item.name === 'string' ? item.name.trim() : '';
        const description = typeof item.description === 'string' ? item.description.trim() : '';
        const targetAudience = typeof item.targetAudience === 'string' ? item.targetAudience.trim() : '';
        if (!name) return null;
        return { name, description, targetAudience };
      })
      .filter((x): x is ContentAngleDraft => x !== null)
      .slice(0, 5);
  } catch {
    return [];
  }
}

export async function generateContentAnglesFromProfile(
  profile: BrandProfileForAngles,
): Promise<ContentAngleDraft[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[generate-content-angles] ANTHROPIC_API_KEY missing, returning empty angles');
    return [];
  }

  const values = asStringList(profile.values);
  const products = asStringList(profile.productsServices);

  const promptLines = [
    `Brand: ${profile.brandName || 'unnamed brand'}`,
    profile.industry ? `Industry: ${profile.industry}` : null,
    profile.targetAudience ? `Target audience: ${profile.targetAudience}` : null,
    profile.companyDescription ? `About: ${profile.companyDescription}` : null,
    profile.mission ? `Mission: ${profile.mission}` : null,
    values.length ? `Values: ${values.join(', ')}` : null,
    products.length ? `Products or services: ${products.join(', ')}` : null,
    profile.keyDifferentiators ? `Key differentiators: ${profile.keyDifferentiators}` : null,
    profile.communicationStyle ? `Voice: ${profile.communicationStyle}` : null,
  ].filter(Boolean).join('\n');

  const prompt = `You are a social media strategist. Given the brand profile below, produce exactly 5 content angles the brand should own on social.

A content angle is a durable theme that the brand can post about week after week - not a single post idea. Angles should feel distinct from each other, be specific enough that a strategist can immediately generate 10 posts inside each one, and be grounded in what the brand actually sells or stands for.

Brand profile:
${promptLines}

Return ONLY a JSON array with exactly 5 objects and this exact shape:
[
  {
    "name": "3 to 6 word angle title in Title Case",
    "description": "1 to 2 sentences describing what posts inside this angle look like and why they matter to the audience",
    "targetAudience": "Short phrase describing who this angle speaks to most directly"
  }
]

Rules:
- No emojis, no hashtags, no markdown.
- No em dashes or en dashes. Use plain hyphens or rephrase.
- Do not repeat the brand name inside every angle title.
- Do not wrap the array in any prose, code fences, or explanation.`;

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      temperature: 0.7,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content
      .filter(c => c.type === 'text')
      .map(c => (c as { text: string }).text)
      .join('\n')
      .trim();

    if (!text) return [];

    const angles = safeJsonParseArray(text);
    return angles;
  } catch (err) {
    console.error('[generate-content-angles] Claude call failed:', err);
    return [];
  }
}
