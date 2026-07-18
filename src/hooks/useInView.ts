'use client';

import type React from 'react';
import { useEffect, useRef, useState } from 'react';

/**
 * IntersectionObserver-based viewport gate.
 *
 * Attach the returned ref to any element; `inView` flips to true when it
 * intersects the viewport (with a small `rootMargin` pre-load buffer).
 *
 * Sticky by default (`once: true`) — once seen, stays true so callers don't
 * thrash-remount heavy children on scroll-past-and-back. Pass `once: false`
 * to get live in/out transitions (e.g. to fully unmount off-screen).
 *
 * Introduced to fix the `/dashboard/posts` OOM crash: PostCard used to mount
 * `<video autoPlay preload="metadata">` for every card, so 200-300 cards ate
 * 600-900 MB. Gating the `<video>` mount on `inView` bounds the working set
 * to what's actually visible.
 */
export function useInView<T extends HTMLElement>(
  opts: { rootMargin?: string; once?: boolean } = {},
): [React.RefObject<T>, boolean] {
  const { rootMargin = '200px', once = true } = opts;
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // SSR / older browsers — fail open so we never hide content behind a
    // gate that's never going to flip.
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setInView(true);
          if (once) io.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin, once]);

  return [ref, inView];
}
