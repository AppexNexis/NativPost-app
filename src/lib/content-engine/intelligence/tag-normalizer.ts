// Content Intelligence Engine — Tag Normalizer
// Phase 5: Normalizes and validates tags for consistency

import type { TagCategory, AnalyzedTag } from './types';

// ─── Tag Aliases ────────────────────────────────────────────────────────────

/**
 * Mapping of equivalent terms to canonical tag names.
 * Keys are lowercase, values are canonical names.
 */
const TAG_ALIASES: Record<string, { name: string; category: TagCategory }> = {
  // Person
  'man': { name: 'Man', category: 'person' },
  'male': { name: 'Man', category: 'person' },
  'woman': { name: 'Woman', category: 'person' },
  'female': { name: 'Woman', category: 'person' },
  'person': { name: 'People', category: 'person' },
  'people': { name: 'People', category: 'person' },
  'human': { name: 'People', category: 'person' },
  'humans': { name: 'People', category: 'person' },
  'entrepreneur': { name: 'Entrepreneur', category: 'audience' },
  'business owner': { name: 'Entrepreneur', category: 'audience' },
  'business_owner': { name: 'Entrepreneur', category: 'audience' },
  'businessowner': { name: 'Entrepreneur', category: 'audience' },

  // Industry
  'fitness': { name: 'Fitness', category: 'industry' },
  'fitness industry': { name: 'Fitness', category: 'industry' },
  'fitness_industry': { name: 'Fitness', category: 'industry' },
  'fitnessindustry': { name: 'Fitness', category: 'industry' },
  'health': { name: 'Health', category: 'industry' },
  'health and fitness': { name: 'Health', category: 'industry' },
  'technology': { name: 'Technology', category: 'industry' },
  'tech': { name: 'Technology', category: 'industry' },
  'finance': { name: 'Finance', category: 'industry' },
  'financial': { name: 'Finance', category: 'industry' },

  // Business Model
  'b2b': { name: 'B2B', category: 'business_model' },
  'b2c': { name: 'B2C', category: 'business_model' },
  'd2c': { name: 'D2C', category: 'business_model' },
  'd-to-c': { name: 'D2C', category: 'business_model' },
  'saas': { name: 'SaaS', category: 'business_model' },
  'software as a service': { name: 'SaaS', category: 'business_model' },
  'ecommerce': { name: 'Ecommerce', category: 'business_model' },
  'e-commerce': { name: 'Ecommerce', category: 'business_model' },

  // Setting
  'office': { name: 'Office', category: 'setting' },
  'gym': { name: 'Gym', category: 'setting' },
  'home': { name: 'Home', category: 'setting' },
  'studio': { name: 'Studio', category: 'setting' },
  'outdoors': { name: 'Outdoor', category: 'environment' },
  'outdoor': { name: 'Outdoor', category: 'environment' },
  'indoors': { name: 'Indoor', category: 'environment' },
  'indoor': { name: 'Indoor', category: 'environment' },

  // Activity
  'speaking': { name: 'Speaking', category: 'activity' },
  'talking': { name: 'Speaking', category: 'activity' },
  'presenting': { name: 'Presenting', category: 'activity' },
  'demonstrating': { name: 'Demonstrating', category: 'activity' },
  'showing': { name: 'Demonstrating', category: 'activity' },
  'explaining': { name: 'Explaining', category: 'activity' },

  // Content Intent
  'education': { name: 'Education', category: 'content_intent' },
  'educational': { name: 'Education', category: 'content_intent' },
  'teaching': { name: 'Education', category: 'content_intent' },
  'inspiration': { name: 'Inspiration', category: 'content_intent' },
  'inspirational': { name: 'Inspiration', category: 'content_intent' },
  'motivational': { name: 'Motivational', category: 'tone' },
  'motivation': { name: 'Motivational', category: 'tone' },
  'promotion': { name: 'Promotion', category: 'content_intent' },
  'promotional': { name: 'Promotion', category: 'content_intent' },
  'advertising': { name: 'Promotion', category: 'content_intent' },

  // Tone
  'professional': { name: 'Professional', category: 'tone' },
  'formal': { name: 'Professional', category: 'tone' },
  'casual': { name: 'Casual', category: 'tone' },
  'informal': { name: 'Casual', category: 'tone' },
  'friendly': { name: 'Friendly', category: 'tone' },
  'authoritative': { name: 'Authoritative', category: 'tone' },

  // Visual Style
  'talking head': { name: 'Talking Head', category: 'visual_style' },
  'talking_head': { name: 'Talking Head', category: 'visual_style' },
  'talkinghead': { name: 'Talking Head', category: 'visual_style' },
  'person speaking': { name: 'Person Speaking', category: 'visual_style' },
  'product demo': { name: 'Product Demonstration', category: 'visual_style' },
  'product demonstration': { name: 'Product Demonstration', category: 'visual_style' },
  'product showcase': { name: 'Product Showcase', category: 'visual_style' },
  'screen recording': { name: 'Screen Recording', category: 'visual_style' },
  'screencast': { name: 'Screen Recording', category: 'visual_style' },
  'green screen': { name: 'Green Screen', category: 'visual_style' },
  'greenscreen': { name: 'Green Screen', category: 'visual_style' },
  'lifestyle': { name: 'Lifestyle', category: 'visual_style' },
  'lifestyle footage': { name: 'Lifestyle', category: 'visual_style' },
  'cinematic': { name: 'Cinematic', category: 'visual_style' },
  'testimonial': { name: 'Testimonial', category: 'content_style' },
  'testimonial style': { name: 'Testimonial', category: 'content_style' },
  'tutorial': { name: 'Tutorial', category: 'content_style' },
  'how-to': { name: 'Tutorial', category: 'content_style' },
  'how to': { name: 'Tutorial', category: 'content_style' },

  // Content Style
  'announcement': { name: 'Announcement', category: 'content_style' },
  'launch': { name: 'Announcement', category: 'content_style' },
  'storytelling': { name: 'Storytelling', category: 'content_intent' },

  // Subject
  'self improvement': { name: 'Self Improvement', category: 'subject' },
  'self_improvement': { name: 'Self Improvement', category: 'subject' },
  'selfimprovement': { name: 'Self Improvement', category: 'subject' },
  'self development': { name: 'Self Improvement', category: 'subject' },
  'personal development': { name: 'Self Improvement', category: 'subject' },
  'growth': { name: 'Growth', category: 'subject' },
  'business growth': { name: 'Growth', category: 'subject' },
  'wellness': { name: 'Health', category: 'subject' },

  // Duration
  'short form': { name: 'Short Form', category: 'duration_tag' },
  'shortform': { name: 'Short Form', category: 'duration_tag' },
  'reel': { name: 'Reel', category: 'format' },
  'reels': { name: 'Reel', category: 'format' },
  'stories': { name: 'Story', category: 'format' },
  'carousel': { name: 'Carousel', category: 'format' },

  // Platform
  'instagram': { name: 'Instagram', category: 'social_platform' },
  'tiktok': { name: 'TikTok', category: 'social_platform' },
  'tik tok': { name: 'TikTok', category: 'social_platform' },
  'linkedin': { name: 'LinkedIn', category: 'social_platform' },
  'youtube': { name: 'YouTube', category: 'social_platform' },
  'facebook': { name: 'Facebook', category: 'social_platform' },

  // Audio
  'speech': { name: 'Speech', category: 'audio_type' },
  'voiceover': { name: 'Speech', category: 'audio_type' },
  'voice over': { name: 'Speech', category: 'audio_type' },
  'music': { name: 'Music', category: 'audio_type' },
  'background music': { name: 'Music', category: 'audio_type' },
  'ambient': { name: 'Ambient', category: 'audio_type' },
  'ambient sound': { name: 'Ambient', category: 'audio_type' },
};

// ─── Tag Normalizer ─────────────────────────────────────────────────────────

/**
 * TagNormalizer — normalizes and validates tags.
 *
 * Responsibilities:
 * 1. Normalize tag names to canonical form
 * 2. Map aliases to canonical tags
 * 3. Validate tag categories
 * 4. Deduplicate tags
 * 5. Enforce confidence thresholds
 */
export class TagNormalizer {
  private confidenceThreshold: number;

  constructor(confidenceThreshold = 0.6) {
    this.confidenceThreshold = confidenceThreshold;
  }

  /**
   * Normalize a list of analyzed tags.
   * - Maps aliases to canonical names
   * - Deduplicates
   * - Filters by confidence threshold
   * - Assigns categories
   */
  normalize(tags: AnalyzedTag[]): AnalyzedTag[] {
    const normalized = new Map<string, AnalyzedTag>();

    for (const tag of tags) {
      // Skip low confidence tags
      if (tag.confidence < this.confidenceThreshold) {
        continue;
      }

      const normalizedTag = this.normalizeTag(tag);
      if (!normalizedTag) continue;

      // Deduplicate by canonical name
      const key = normalizedTag.name.toLowerCase();
      const existing = normalized.get(key);

      if (existing) {
        // Keep higher confidence
        if (normalizedTag.confidence > existing.confidence) {
          normalized.set(key, normalizedTag);
        }
      } else {
        normalized.set(key, normalizedTag);
      }
    }

    return Array.from(normalized.values());
  }

  /**
   * Normalize a single tag.
   */
  normalizeTag(tag: AnalyzedTag): AnalyzedTag | null {
    const rawName = tag.name.trim();
    if (!rawName) return null;

    // Try to find canonical mapping
    const canonical = this.findCanonical(rawName);

    if (canonical) {
      return {
        ...tag,
        name: canonical.name,
        category: canonical.category,
        raw: tag.raw ?? rawName,
      };
    }

    // No mapping found — use as-is with category
    return {
      ...tag,
      name: this.toTitleCase(rawName),
      category: tag.category,
      raw: tag.raw ?? rawName,
    };
  }

  /**
   * Find canonical tag for a raw name.
   */
  private findCanonical(rawName: string): { name: string; category: TagCategory } | null {
    const lower = rawName.toLowerCase().trim();

    // Direct lookup
    if (TAG_ALIASES[lower]) {
      return TAG_ALIASES[lower];
    }

    // Try removing underscores/hyphens and searching again
    const normalized = lower.replace(/[_-]/g, ' ').trim();
    if (TAG_ALIASES[normalized]) {
      return TAG_ALIASES[normalized];
    }

    // Try partial match
    for (const [alias, canonical] of Object.entries(TAG_ALIASES)) {
      if (lower.includes(alias) || alias.includes(lower)) {
        return canonical;
      }
    }

    return null;
  }

  /**
   * Convert string to Title Case.
   */
  private toTitleCase(str: string): string {
    return str
      .split(/[\s_-]+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Select top N tags by confidence for library-facing output.
   */
  selectTopTags(tags: AnalyzedTag[], maxTags: number): AnalyzedTag[] {
    return tags
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, maxTags);
  }

  /**
   * Validate that a tag category is valid.
   */
  isValidCategory(category: string): category is TagCategory {
    const validCategories: TagCategory[] = [
      'person', 'audience', 'industry', 'business_model', 'product',
      'setting', 'activity', 'content_intent', 'tone', 'visual_style',
      'content_style', 'object', 'environment', 'demographic', 'use_case',
      'occasion', 'creator_type', 'subject', 'topic', 'format', 'emotion',
      'color_palette', 'composition', 'text_visible', 'audio_type', 'language',
      'brand_element', 'cta_type', 'social_platform', 'resolution',
      'aspect_ratio_tag', 'duration_tag', 'quality_level', 'freshness',
      'originality', 'engagement_type', 'funnel_stage', 'value_proposition',
      'social_proof', 'urgency', 'seasonality', 'trend', 'competition',
      'monetization', 'platform_feature', 'content_purpose', 'target_action',
      'audience_size', 'content_length', 'production_value', 'narrative_type',
      'pacing', 'energy_level', 'trust_signal', 'pain_point', 'benefit',
      'feature', 'outcome', 'test',
    ];
    return validCategories.includes(category as TagCategory);
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let instance: TagNormalizer | null = null;

/**
 * Get the singleton TagNormalizer instance.
 */
export function getTagNormalizer(confidenceThreshold?: number): TagNormalizer {
  if (!instance) {
    instance = new TagNormalizer(confidenceThreshold);
  }
  return instance;
}

/**
 * Reset the singleton (for testing).
 */
export function resetTagNormalizer(): void {
  instance = null;
}
