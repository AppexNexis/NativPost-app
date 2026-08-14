/**
 * The guide registry — the single source of truth for the learning centre.
 *
 * Ordering, numbering ("01", "02" on the index cards) and the "Read next"
 * links are all derived from here, so adding a guide is a one-line change in
 * `GUIDES` plus its content file.
 *
 * `assertRegistryIntegrity` is called from the unit test rather than at import
 * time: a bad slug reference should fail CI, not a user's page load.
 */

import { aiStudio } from './guides/ai-studio';
import { blitzDailyQueue } from './guides/blitz-daily-queue';
import { campaigns } from './guides/campaigns';
import { connectYourChannels } from './guides/connect-your-channels';
import { getStarted } from './guides/get-started';
import { managedInfrastructure } from './guides/managed-infrastructure';
import { mcpAndApi } from './guides/mcp-and-api';
import type { Guide, GuideCategory } from './types';
import { CATEGORY_ORDER } from './types';

export const GUIDES: Guide[] = [
  getStarted,
  connectYourChannels,
  managedInfrastructure,
  blitzDailyQueue,
  campaigns,
  aiStudio,
  mcpAndApi,
];

/** Guides in display order: by category order, then by each guide's `order`. */
export function getAllGuides(): Guide[] {
  return [...GUIDES].sort((a, b) => {
    const byCategory = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
    return byCategory !== 0 ? byCategory : a.order - b.order;
  });
}

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find(g => g.slug === slug);
}

/** The one guide promoted to the hero card. Falls back to the first in order. */
export function getFeaturedGuide(): Guide {
  return GUIDES.find(g => g.featured) ?? getAllGuides()[0]!;
}

export type CategoryGroup = { category: GuideCategory; guides: Guide[] };

/**
 * Guides grouped for the index page, excluding the featured one (it already
 * has the hero) and any category left empty.
 */
export function getGroupedGuides(): CategoryGroup[] {
  const featured = getFeaturedGuide();
  const groups: CategoryGroup[] = [];

  for (const category of CATEGORY_ORDER) {
    const guides = getAllGuides().filter(g => g.category === category && g.slug !== featured.slug);
    if (guides.length > 0) {
      groups.push({ category, guides });
    }
  }

  return groups;
}

/**
 * Sequential number shown on a card ("01", "02", …), counted across the whole
 * index in display order so the numbering reads continuously down the page —
 * matching the reference design.
 */
export function getGuideNumbers(): Map<string, string> {
  const featured = getFeaturedGuide();
  const numbers = new Map<string, string>();
  let n = 1;

  for (const group of getGroupedGuides()) {
    for (const guide of group.guides) {
      numbers.set(guide.slug, String(n).padStart(2, '0'));
      n += 1;
    }
  }
  // The hero is not numbered, but callers may look it up.
  numbers.set(featured.slug, '00');

  return numbers;
}

/** Resolved "Read next" entries, skipping anything that no longer exists. */
export function getReadNext(guide: Guide): Guide[] {
  return (guide.readNext ?? [])
    .map(slug => getGuide(slug))
    .filter((g): g is Guide => Boolean(g) && g!.slug !== guide.slug);
}

/**
 * Structural checks the type system can't make. Throws on the first problem.
 * Exercised by learn-registry.test.ts.
 */
export function assertRegistryIntegrity(): void {
  const slugs = new Set<string>();

  for (const guide of GUIDES) {
    if (slugs.has(guide.slug)) {
      throw new Error(`Duplicate guide slug: ${guide.slug}`);
    }
    slugs.add(guide.slug);

    if (!/^[a-z0-9-]+$/.test(guide.slug)) {
      throw new Error(`Guide slug is not URL-safe: ${guide.slug}`);
    }

    const sectionIds = new Set<string>();
    for (const section of guide.sections) {
      if (sectionIds.has(section.id)) {
        throw new Error(`Duplicate section id "${section.id}" in guide ${guide.slug}`);
      }
      sectionIds.add(section.id);
      if (!/^[a-z0-9-]+$/.test(section.id)) {
        throw new Error(`Section id is not anchor-safe: ${guide.slug}#${section.id}`);
      }
    }
  }

  for (const guide of GUIDES) {
    for (const slug of guide.readNext ?? []) {
      if (!slugs.has(slug)) {
        throw new Error(`Guide ${guide.slug} links to unknown slug "${slug}" in readNext`);
      }
    }
  }

  const featured = GUIDES.filter(g => g.featured);
  if (featured.length > 1) {
    throw new Error(`Only one guide may be featured, found: ${featured.map(g => g.slug).join(', ')}`);
  }
}
