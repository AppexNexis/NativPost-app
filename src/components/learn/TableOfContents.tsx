'use client';

import { useEffect, useState } from 'react';

import type { GuideSection } from '@/lib/learn/types';
import { cn } from '@/utils/Helpers';

/**
 * Sticky in-page contents with scroll spy.
 *
 * Ids come from the guide's `sections`, so an entry can never point at a
 * heading that isn't there. The observer's rootMargin biases the "active"
 * band to the upper third of the viewport, which is where a reader's eye
 * actually is — without it, the highlight lags a section behind while
 * scrolling down.
 */
export function TableOfContents({ sections }: { sections: GuideSection[] }) {
  const [activeId, setActiveId] = useState<string | null>(sections[0]?.id ?? null);

  useEffect(() => {
    const elements = sections
      .map(s => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);

    if (elements.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: '-80px 0px -66% 0px', threshold: 0 },
    );

    elements.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [sections]);

  if (sections.length < 2) {
    return null;
  }

  return (
    <nav aria-label="On this page">
      <p className="mb-3 text-label font-semibold uppercase tracking-wide text-muted-foreground">
        Table of contents
      </p>
      <ul className="space-y-1 border-l">
        {sections.map((section) => {
          const active = section.id === activeId;
          return (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className={cn(
                  '-ml-px block border-l py-1 pl-3 text-meta transition-colors',
                  active
                    ? 'border-primary font-medium text-foreground'
                    : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                )}
              >
                {section.heading}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
