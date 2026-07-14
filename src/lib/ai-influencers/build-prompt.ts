/**
 * Shared trait → prompt builder for AI influencer image generation.
 *
 * Consumers:
 * - src/app/api/ai-influencers/[id]/generate-image/route.ts (persisted regen from detail page)
 * - src/app/api/ai-influencers/preview-face/route.ts        (in-wizard candidate preview)
 *
 * Keep these two paths in sync — divergence causes the preview face to differ
 * from the persisted regen, which is exactly what this helper prevents.
 */

export type InfluencerTraits = {
  name?: string | null;
  description?: string | null;
  gender?: string | null;
  ageRange?: string | null;
  ethnicity?: string | null;
  hairStyle?: string | null;
  hairColor?: string | null;
  bodyType?: string | null;
  fashionStyle?: string | null;
  poseStyle?: string | null;
  backgroundPreference?: string | null;
};

export function buildInfluencerPrompt(
  traits: InfluencerTraits,
  regenerationInstructions?: string,
): string {
  const parts: string[] = [];

  parts.push('A photorealistic portrait photograph of the same person, consistent facial features, consistent skin tone, high detail, studio lighting, 8k quality.');

  if (traits.gender) {
    parts.push(`${traits.gender}`);
  }
  if (traits.ageRange) {
    parts.push(`aged ${traits.ageRange}`);
  }
  if (traits.ethnicity) {
    parts.push(`of ${traits.ethnicity} ethnicity`);
  }
  if (traits.bodyType) {
    parts.push(`with a ${traits.bodyType} build`);
  }
  if (traits.hairStyle && traits.hairColor) {
    parts.push(`${traits.hairColor} ${traits.hairStyle} hair`);
  } else if (traits.hairColor) {
    parts.push(`${traits.hairColor} hair`);
  } else if (traits.hairStyle) {
    parts.push(`${traits.hairStyle} hair`);
  }
  if (traits.fashionStyle) {
    parts.push(`wearing ${traits.fashionStyle} clothing`);
  }
  if (traits.poseStyle) {
    parts.push(`in a ${traits.poseStyle} pose`);
  }
  if (traits.backgroundPreference) {
    parts.push(`with a ${traits.backgroundPreference} background`);
  }

  parts.push('Front-facing, clear face, sharp eyes, natural expression, professional photography, neutral background, consistent across all generations.');

  const trimmedRegen = regenerationInstructions?.trim();
  if (trimmedRegen) {
    parts.push(`Adjustments: ${trimmedRegen}`);
  }

  return parts.join('. ');
}

/**
 * Build a short descriptive caption for the image engine's design overlay.
 * The engine extracts headlines/subtext from this caption for the composite
 * layout. Without it, /render/scene rejects the request with 400.
 */
export function buildInfluencerCaption(traits: InfluencerTraits): string {
  const name = traits.name || 'AI Creator';
  const descriptor: string[] = [];

  if (traits.gender) descriptor.push(traits.gender);
  if (traits.ageRange) descriptor.push(traits.ageRange);
  if (traits.ethnicity) descriptor.push(traits.ethnicity);

  const who = descriptor.length > 0 ? `${descriptor.join(', ')} content creator` : 'content creator';

  const style: string[] = [];
  if (traits.fashionStyle) style.push(traits.fashionStyle);
  if (traits.backgroundPreference) style.push(traits.backgroundPreference);

  let caption = `Meet ${name}, a ${who}.`;
  if (style.length > 0) {
    caption += ` Styled in ${style.join(' ')} aesthetic.`;
  }
  caption += ' Professional portrait photography, sharp details, studio lighting.';

  return caption;
}
