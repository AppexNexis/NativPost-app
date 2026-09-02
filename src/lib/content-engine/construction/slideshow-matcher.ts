// Content Intelligence Engine — Slideshow Matcher
// Phase 6: Compatibility scoring and sequencing for slideshow content

import type { SlideText, TextPosition, TextStyle, SlideRole } from './types';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SlideshowCandidate {
  assetId: string;
  url: string;
  assetType: string;
  tags: string[];
  semanticEmbedding?: number[];
  visualQualityScore: number | null;
  aspectRatio: string | null;
  durationSeconds: number | null;
}

export interface CompatibilityResult {
  compatible: boolean;
  score: number;          // 0-1
  tagOverlap: number;     // Number of shared tags
  sharedTags: string[];
  visualSimilarity: number | null;
  styleCompatibility: number;
  subjectCompatibility: number;
  reasoning: string[];
}

export interface SlideshowPlan {
  assets: SlideshowCandidate[];
  ordering: SlideOrdering[];
  text: SlideText[];
  compatibilityScore: number;
  sequencingMethod: string;
}

export interface SlideOrdering {
  slideIndex: number;
  assetId: string;
  slotName: string;
  role: SlideRole;
}

// ─── Slideshow Matcher ───────────────────────────────────────────────────────

/**
 * SlideshowMatcher — handles compatibility scoring and sequencing
 * for slideshow content construction.
 *
 * A slideshow must contain 3-5 assets with meaningful compatibility.
 * Random assets sharing one generic tag are not sufficient.
 */
export class SlideshowMatcher {
  private compatibilityThreshold: number;
  private minTagOverlap: number;

  constructor(config: {
    compatibilityThreshold?: number;
    minTagOverlap?: number;
    maxVisualSimilarity?: number;
  } = {}) {
    this.compatibilityThreshold = config.compatibilityThreshold ?? 0.6;
    this.minTagOverlap = config.minTagOverlap ?? 1;
  }

  /**
   * Find the best set of compatible assets for a slideshow.
   *
   * @param candidates - Pool of qualified image assets
   * @param targetCount - Desired number of slides (3-5)
   * @returns SlideshowPlan with compatible assets and ordering
   */
  async findCompatibleSet(
    candidates: SlideshowCandidate[],
    targetCount: number,
  ): Promise<SlideshowPlan | null> {
    // Enforce 3-5 asset constraint
    if (targetCount < 3 || targetCount > 5) {
      throw new Error(`Slideshow must have 3-5 assets, got ${targetCount}`);
    }

    if (candidates.length < 3) {
      return null; // Not enough candidates
    }

    // Score all pairwise combinations
    const combinations = this.generateCombinations(candidates, targetCount);
    let bestCombination: SlideshowCandidate[] | null = null;
    let bestScore = 0;

    for (const combo of combinations) {
      const compatibility = this.scoreCompatibility(combo);
      if (compatibility.compatible && compatibility.score > bestScore) {
        bestScore = compatibility.score;
        bestCombination = combo;
      }
    }

    if (!bestCombination) {
      return null; // No compatible set found
    }

    // Sequence the assets
    const ordering = this.sequenceAssets(bestCombination);

    return {
      assets: bestCombination,
      ordering,
      text: [], // Will be populated by text generator
      compatibilityScore: bestScore,
      sequencingMethod: 'attention-first',
    };
  }

  /**
   * Score compatibility of a set of assets for a slideshow.
   */
  scoreCompatibility(assets: SlideshowCandidate[]): CompatibilityResult {
    const reasoning: string[] = [];

    if (assets.length < 3) {
      return {
        compatible: false,
        score: 0,
        tagOverlap: 0,
        sharedTags: [],
        visualSimilarity: null,
        styleCompatibility: 0,
        subjectCompatibility: 0,
        reasoning: ['Need at least 3 assets for slideshow compatibility'],
      };
    }

    if (assets.length > 5) {
      return {
        compatible: false,
        score: 0,
        tagOverlap: 0,
        sharedTags: [],
        visualSimilarity: null,
        styleCompatibility: 0,
        subjectCompatibility: 0,
        reasoning: ['Maximum 5 assets allowed for slideshow'],
      };
    }

    // 1. Tag overlap analysis
    const tagSets = assets.map(a => new Set(a.tags.map(t => t.toLowerCase())));
    const sharedTags = this.findSharedTags(tagSets);
    const tagOverlap = sharedTags.length;

    if (tagOverlap < this.minTagOverlap) {
      reasoning.push(
        `Tag overlap ${tagOverlap} below minimum ${this.minTagOverlap}`,
      );
    } else {
      reasoning.push(`Tag overlap ${tagOverlap}: ${sharedTags.join(', ')}`);
    }

    // 2. Style compatibility (visual quality consistency)
    const qualityScores = assets
      .map(a => a.visualQualityScore)
      .filter((s): s is number => s !== null);
    const styleCompatibility = qualityScores.length > 0
      ? 1 - (Math.max(...qualityScores) - Math.min(...qualityScores))
      : 0.5;

    reasoning.push(`Style compatibility: ${styleCompatibility.toFixed(3)}`);

    // 3. Subject compatibility (semantic tag overlap)
    const subjectTags = assets.flatMap(a =>
      a.tags.filter(t =>
        t.includes('person') || t.includes('fitness') || t.includes('business') ||
        t.includes('entrepreneur') || t.includes('marketing') || t.includes('tech') ||
        t.includes('health') || t.includes('finance') || t.includes('education'),
      ),
    );
    const uniqueSubjectTags = [...new Set(subjectTags)];
    const subjectCompatibility = uniqueSubjectTags.length > 0
      ? Math.min(1, uniqueSubjectTags.length / 3)
      : 0.3;

    reasoning.push(`Subject compatibility: ${subjectCompatibility.toFixed(3)}`);

    // 4. Visual similarity (placeholder — would use embedding cosine similarity)
    const visualSimilarity: number | null = null;

    // Calculate overall score
    const scores = [
      tagOverlap >= this.minTagOverlap ? 0.4 : 0,
      styleCompatibility * 0.3,
      subjectCompatibility * 0.3,
    ];
    const score = scores.reduce((a, b) => a + b, 0);

    const compatible = score >= this.compatibilityThreshold && tagOverlap >= this.minTagOverlap;

    return {
      compatible,
      score,
      tagOverlap,
      sharedTags,
      visualSimilarity,
      styleCompatibility,
      subjectCompatibility,
      reasoning,
    };
  }

  /**
   * Find tags shared across all assets.
   */
  private findSharedTags(tagSets: Set<string>[]): string[] {
    if (tagSets.length === 0) return [];

    let shared = new Set(tagSets[0]);
    for (let i = 1; i < tagSets.length; i++) {
      shared = new Set([...shared].filter(tag => tagSets[i]?.has(tag)));
    }

    return Array.from(shared);
  }

  /**
   * Generate all combinations of k assets from the candidate pool.
   */
  private generateCombinations(
    candidates: SlideshowCandidate[],
    k: number,
  ): SlideshowCandidate[][] {
    if (k === 0) return [[]];
    if (candidates.length === 0) return [];

    const [first, ...rest] = candidates;
    if (!first) return [];

    const withFirst = this.generateCombinations(rest, k - 1).map(combo => [first, ...combo]);
    const withoutFirst = this.generateCombinations(rest, k);

    return [...withFirst, ...withoutFirst];
  }

  /**
   * Sequence assets using attention-first strategy.
   *
   * Slide 1: attention / strongest visual
   * Slide 2: supporting context
   * Slide 3: supporting idea
   * Slide 4: optional expansion
   * Slide 5: optional conclusion
   */
  sequenceAssets(assets: SlideshowCandidate[]): SlideOrdering[] {
    // Sort by visual quality score (descending) for attention-first
    const sorted = [...assets].sort((a, b) => {
      const scoreA = a.visualQualityScore ?? 0.5;
      const scoreB = b.visualQualityScore ?? 0.5;
      return scoreB - scoreA;
    });

    const roles: SlideRole[] = ['attention', 'context', 'expansion', 'reinforcement', 'conclusion'];

    return sorted.map((asset, index) => ({
      slideIndex: index,
      assetId: asset.assetId,
      slotName: `slide_${index + 1}`,
      role: roles[index] ?? 'expansion',
    }));
  }
}

// ─── Text Positioning ────────────────────────────────────────────────────────

/**
 * Default text positions for slideshow slides.
 */
export function getDefaultTextPosition(slideRole: SlideRole): TextPosition {
  switch (slideRole) {
    case 'attention':
      return { x: 0.5, y: 0.3, anchor: 'top', alignment: 'center' };
    case 'context':
      return { x: 0.5, y: 0.5, anchor: 'center', alignment: 'center' };
    case 'expansion':
      return { x: 0.5, y: 0.5, anchor: 'center', alignment: 'center' };
    case 'reinforcement':
      return { x: 0.5, y: 0.5, anchor: 'center', alignment: 'center' };
    case 'conclusion':
      return { x: 0.5, y: 0.7, anchor: 'bottom', alignment: 'center' };
    default:
      return { x: 0.5, y: 0.5, anchor: 'center', alignment: 'center' };
  }
}

/**
 * Default text style for slideshow slides.
 */
export function getDefaultTextStyle(slideRole: SlideRole): TextStyle {
  const base: TextStyle = {
    fontSize: slideRole === 'attention' ? 36 : 28,
    fontFamily: 'Inter',
    color: '#FFFFFF',
    shadow: true,
    outline: true,
  };

  if (slideRole === 'conclusion') {
    return { ...base, backgroundColor: 'rgba(0,0,0,0.6)' };
  }

  return base;
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _instance: SlideshowMatcher | null = null;

export function getSlideshowMatcher(config?: {
  compatibilityThreshold?: number;
  minTagOverlap?: number;
  maxVisualSimilarity?: number;
}): SlideshowMatcher {
  if (!_instance) {
    _instance = new SlideshowMatcher(config);
  }
  return _instance;
}
