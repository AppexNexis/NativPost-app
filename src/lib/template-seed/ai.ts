/**
 * AI enrichment for raw trending templates.
 * Uses Claude to extract hook/body/CTA structure, classify niches,
 * and generate angles from video metadata.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { EnrichedTemplate, NicheTag, RawTemplate, TemplateStructure } from './types';

const VALID_NICHES: NicheTag[] = [
  'b2b_saas',
  'agency',
  'ecommerce',
  'personal_brand',
  'fitness',
  'fintech',
  'africa_market',
  'health',
  'education',
  'food',
  'travel',
  'fashion',
];

function estimateEngagementScore(template: RawTemplate): number {
  // Fallback scoring when real engagement data is unavailable.
  // Pexels clips have no engagement; YouTube clips have view counts.
  if (template.viewCount && template.viewCount > 0) {
    const logViews = Math.log10(Math.max(template.viewCount, 1));
    return Math.min(0.95, 0.5 + logViews / 10);
  }
  // Stock clips get a baseline score.
  return 0.72;
}

export async function enrichTemplateWithAI(
  template: RawTemplate,
  apiKey: string,
): Promise<EnrichedTemplate> {
  const client = new Anthropic({ apiKey });

  const prompt = `You are a viral short-form content analyst. Given the following video metadata, extract a content structure and classify the template.

Source platform: ${template.sourcePlatform}
Content type: ${template.contentType}
Title: ${template.title || 'N/A'}
Description: ${template.description || 'N/A'}
Duration: ${template.durationSeconds ?? 'unknown'} seconds

Return ONLY valid JSON with this shape:
{
  "niches": ["b2b_saas" | "agency" | "ecommerce" | "personal_brand" | "fitness" | "fintech" | "africa_market" | "health" | "education" | "food" | "travel" | "fashion"],
  "angles": ["educational" | "hot_take" | "storytelling" | "motivational" | "myth_busting" | "behind_the_scenes" | "how_to" | "product_demo" | "testimonial" | "comparison"],
  "structure": {
    "hook": { "text": "string", "duration": number, "visualType": "text_overlay|talking_head|b_roll|product_shot" },
    "body": { "text": "string", "duration": number },
    "cta": { "text": "string", "duration": number },
    "transitions": ["string"],
    "musicStyle": "string",
    "textOverlayStyle": "string"
  }
}

Rules:
- Hook text must be attention-grabbing, 5-12 words.
- Body text must deliver value, 15-40 words.
- CTA text must invite engagement, 4-10 words.
- Durations must sum to roughly the video duration if known.
- Choose niches and angles that best fit the content.`;

  let niches: NicheTag[] = [];
  let angles: string[] = [];
  let structure: TemplateStructure = {};

  try {
    const response = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1024,
      temperature: 0.5,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('\n');

    // Extract JSON from possible markdown code block.
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : text;
    const parsed = JSON.parse(jsonStr);

    niches = (parsed.niches || []).filter((n: string) => VALID_NICHES.includes(n as NicheTag)) as NicheTag[];
    angles = parsed.angles || [];
    structure = parsed.structure || {};
  } catch (err) {
    console.error(`[AI Enrichment] Failed for ${template.sourceUrl}:`, err);
  }

  // Ensure we always have at least one niche and one angle.
  if (niches.length === 0) niches = ['personal_brand'];
  if (angles.length === 0) angles = ['educational'];

  // Make sure structure has required fields with sensible defaults.
  const totalDuration = template.durationSeconds ?? 15;
  const hookDuration = Math.min(3, Math.max(1, Math.round(totalDuration * 0.25)));
  const ctaDuration = Math.min(2, Math.max(1, Math.round(totalDuration * 0.15)));
  const bodyDuration = Math.max(1, totalDuration - hookDuration - ctaDuration);

  structure.hook = structure.hook || {
    text: 'This one thing changed everything for my business.',
    duration: hookDuration,
    visualType: 'text_overlay',
  };
  structure.body = structure.body || {
    text: 'Most people overlook the simple shift that makes content actually convert. Here is what actually works.',
    duration: bodyDuration,
  };
  structure.cta = structure.cta || {
    text: 'Follow for the full breakdown.',
    duration: ctaDuration,
  };
  structure.transitions = structure.transitions || ['quick_cut'];
  structure.musicStyle = structure.musicStyle || 'upbeat_lofi';
  structure.textOverlayStyle = structure.textOverlayStyle || 'bold_caption';

  return {
    ...template,
    niches,
    angles,
    structure,
    engagementScore: estimateEngagementScore(template),
  };
}
