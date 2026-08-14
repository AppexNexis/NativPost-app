import { describe, expect, it } from 'vitest';

import {
  assertRegistryIntegrity,
  getAllGuides,
  getFeaturedGuide,
  getGroupedGuides,
  getGuide,
  getGuideNumbers,
  getReadNext,
  GUIDES,
} from './registry';
import { CATEGORY_LABELS, CATEGORY_ORDER } from './types';

describe('learn registry', () => {
  it('is structurally sound — unique slugs, anchor-safe ids, resolvable links', () => {
    expect(() => assertRegistryIntegrity()).not.toThrow();
  });

  it('exposes exactly one featured guide for the hero', () => {
    expect(GUIDES.filter(g => g.featured)).toHaveLength(1);
    expect(getFeaturedGuide().slug).toBe('get-started');
  });

  it('sorts by category order, then by each guide\'s order', () => {
    const ordered = getAllGuides();
    const positions = ordered.map(g => CATEGORY_ORDER.indexOf(g.category));

    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('excludes the featured guide from the numbered category lists', () => {
    const slugs = getGroupedGuides().flatMap(g => g.guides.map(x => x.slug));

    expect(slugs).not.toContain(getFeaturedGuide().slug);
    expect(slugs.length).toBe(GUIDES.length - 1);
  });

  it('numbers cards continuously down the page', () => {
    const numbers = getGuideNumbers();
    const sequence = getGroupedGuides()
      .flatMap(g => g.guides.map(x => numbers.get(x.slug)));

    expect(sequence).toEqual(sequence.map((_, i) => String(i + 1).padStart(2, '0')));
  });

  it('gives every category in use a display label', () => {
    for (const group of getGroupedGuides()) {
      expect(CATEGORY_LABELS[group.category]).toBeTruthy();
    }
  });

  it('resolves read-next links and never links a guide to itself', () => {
    for (const guide of GUIDES) {
      const next = getReadNext(guide);

      expect(next.length).toBeLessThanOrEqual((guide.readNext ?? []).length);
      expect(next.map(n => n.slug)).not.toContain(guide.slug);
    }
  });

  it('returns undefined for an unknown slug rather than throwing', () => {
    expect(getGuide('does-not-exist')).toBeUndefined();
  });

  it('gives every guide a summary, a read time and at least two sections', () => {
    for (const guide of GUIDES) {
      expect(guide.summary.length, guide.slug).toBeGreaterThan(30);
      expect(guide.readingMinutes, guide.slug).toBeGreaterThan(0);
      expect(guide.sections.length, guide.slug).toBeGreaterThanOrEqual(2);
    }
  });

  it('gives every section at least one block', () => {
    for (const guide of GUIDES) {
      for (const section of guide.sections) {
        expect(section.blocks.length, `${guide.slug}#${section.id}`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps table rows the same width as their header', () => {
    for (const guide of GUIDES) {
      for (const section of guide.sections) {
        for (const block of section.blocks) {
          if (block.type === 'table') {
            for (const row of block.rows) {
              expect(row.length, `${guide.slug}#${section.id}`).toBe(block.head.length);
            }
          }
        }
      }
    }
  });

  it('leaves no unclosed inline markup in guide copy', () => {
    const texts: string[] = [];
    for (const guide of GUIDES) {
      for (const section of guide.sections) {
        for (const block of section.blocks) {
          if (block.type === 'p' || block.type === 'callout') {
            texts.push(block.text);
          }
          if (block.type === 'list') {
            texts.push(...block.items);
          }
          if (block.type === 'steps') {
            texts.push(...block.items.flatMap(i => [i.title, i.text]));
          }
        }
      }
    }

    for (const text of texts) {
      // `**` and backticks must come in pairs, else the renderer emits the
      // literal asterisks into the page.
      expect((text.match(/\*\*/g) ?? []).length % 2, text.slice(0, 60)).toBe(0);
      expect((text.match(/`/g) ?? []).length % 2, text.slice(0, 60)).toBe(0);
    }
  });
});
