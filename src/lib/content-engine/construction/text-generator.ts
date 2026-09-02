// Content Intelligence Engine — Text Generator
// Phase 6: Generates text overlays and captions for content compositions

import type { SlideText, TextPosition, TextStyle, SlideRole } from './types';
import { getDefaultTextPosition, getDefaultTextStyle } from './slideshow-matcher';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TextGenerationInput {
  assetTags: string[];
  assetDescription: string;
  slideRole: SlideRole;
  overallConcept?: string;
  contentType: string;
}

export interface GeneratedText {
  text: string;
  position: TextPosition;
  style: TextStyle;
}

// ─── Text Generator ──────────────────────────────────────────────────────────

/**
 * TextGenerator — produces text overlays and captions for content.
 *
 * Text must correspond to the actual visual content.
 * Do not generate unrelated copy.
 */
export class TextGenerator {
  constructor(_version = '1.0.0') {
  }

  /**
   * Generate text for a single slide.
   */
  generateSlideText(input: TextGenerationInput): GeneratedText {
    const { assetTags, assetDescription, slideRole, overallConcept } = input;

    // Build text from available intelligence
    const text = this.composeText(assetTags, assetDescription, slideRole, overallConcept);

    // Determine position based on role
    const position = getDefaultTextPosition(slideRole);

    // Determine style based on role
    const style = getDefaultTextStyle(slideRole);

    return { text, position, style };
  }

  /**
   * Generate text for all slides in a slideshow.
   */
  generateSlideshowText(slides: Array<{
    assetTags: string[];
    assetDescription: string;
    slideRole: SlideRole;
  }>, overallConcept?: string): SlideText[] {
    return slides.map((slide, index) => {
      const generated = this.generateSlideText({
        ...slide,
        contentType: 'slideshow',
        overallConcept,
      });

      return {
        slideIndex: index,
        slotName: `slide_${index + 1}`,
        text: generated.text,
        position: generated.position,
        style: generated.style,
      };
    });
  }

  /**
   * Generate caption text for content.
   */
  generateCaption(
    tags: string[],
    description: string,
    contentType: string,
  ): string {
    const concepts = this.extractKeyConcepts(tags, description);

    if (concepts.length === 0) {
      return this.getDefaultCaption(contentType);
    }

    // Build caption from concepts
    const primaryConcept = concepts[0] ?? 'Content';
    const supportingConcepts = concepts.slice(1, 3);

    if (supportingConcepts.length === 0) {
      return primaryConcept;
    }

    return `${primaryConcept} ${supportingConcepts.join(' + ')}`;
  }

  /**
   * Compose text for a slide based on its role and content.
   */
  private composeText(
    tags: string[],
    description: string,
    role: SlideRole,
    overallConcept?: string,
  ): string {
    const concepts = this.extractKeyConcepts(tags, description);

    switch (role) {
      case 'attention':
        return this.composeAttentionText(concepts, overallConcept);
      case 'context':
        return this.composeContextText(concepts, description);
      case 'expansion':
        return this.composeExpansionText(concepts, description);
      case 'reinforcement':
        return this.composeReinforcementText(concepts);
      case 'conclusion':
        return this.composeConclusionText(concepts, overallConcept);
      default:
        return this.composeDefaultText(concepts);
    }
  }

  /**
   * Extract key concepts from tags and description.
   */
  private extractKeyConcepts(tags: string[], description: string): string[] {
    // Filter out generic/low-value tags
    const genericTags = new Set([
      'image', 'photo', 'video', 'content', 'media',
      'short form', 'reel', 'story', 'carousel',
      'instagram', 'tiktok', 'linkedin', 'youtube',
    ]);

    const specificTags = tags
      .filter(t => !genericTags.has(t.toLowerCase()))
      .map(t => this.toTitleCase(t));

    // Extract noun phrases from description
    const descriptionConcepts = description
      .split(/[,;.]/)
      .map(s => s.trim())
      .filter(s => s.length > 3 && s.length < 50)
      .slice(0, 3);

    // Combine and deduplicate
    const all = [...specificTags, ...descriptionConcepts];
    return [...new Set(all)].slice(0, 5);
  }

  /**
   * Compose attention-grabbing text (Slide 1).
   */
  private composeAttentionText(concepts: string[], overallConcept?: string): string {
    if (overallConcept) {
      return overallConcept;
    }

    if (concepts.length === 0) {
      return 'Stop scrolling';
    }

    const primary = concepts[0];
    return primary ?? 'Stop scrolling';
  }

  /**
   * Compose context text (Slide 2).
   */
  private composeContextText(concepts: string[], _description: string): string {
    if (concepts.length < 2) {
      return 'Here is what you need to know';
    }

    const supporting = concepts.slice(0, 2).join(' & ');
    return `About ${supporting}`;
  }

  /**
   * Compose expansion text (Slide 3).
   */
  private composeExpansionText(concepts: string[], _description: string): string {
    if (concepts.length < 3) {
      return 'The details matter';
    }

    const detail = concepts[2];
    return `Including ${detail}`;
  }

  /**
   * Compose reinforcement text (Slide 4).
   */
  private composeReinforcementText(concepts: string[]): string {
    if (concepts.length === 0) {
      return 'Remember this';
    }

    return `Key takeaway: ${concepts[0]}`;
  }

  /**
   * Compose conclusion text (Slide 5).
   */
  private composeConclusionText(concepts: string[], overallConcept?: string): string {
    if (overallConcept) {
      return `Save this for later`;
    }

    if (concepts.length === 0) {
      return 'Save this for later';
    }

    return `Save this ${concepts[0]} guide`;
  }

  /**
   * Compose default text.
   */
  private composeDefaultText(concepts: string[]): string {
    if (concepts.length === 0) {
      return 'Check this out';
    }

    return concepts[0] ?? 'Check this out';
  }

  /**
   * Get a default caption for a content type.
   */
  private getDefaultCaption(contentType: string): string {
    switch (contentType) {
      case 'slideshow':
        return 'Swipe through for more';
      case 'reel':
        return 'Watch until the end';
      case 'single_image':
        return 'Tap to learn more';
      case 'talking_head':
        return 'Listen to this';
      case 'ugc':
        return 'Real talk';
      default:
        return 'Check this out';
    }
  }

  /**
   * Convert a string to title case.
   */
  private toTitleCase(str: string): string {
    return str
      .split(/[\s_]+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _instance: TextGenerator | null = null;

export function getTextGenerator(version?: string): TextGenerator {
  if (!_instance) {
    _instance = new TextGenerator(version);
  }
  return _instance;
}
