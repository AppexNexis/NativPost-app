'use client';

import * as React from 'react';

import { cn } from '@/utils/Helpers';

/**
 * Avatar with graceful image fallback — no Radix dependency required.
 * Shows initials (or any fallback node) until the image loads, and again
 * if it errors.
 */

type AvatarProps = React.HTMLAttributes<HTMLSpanElement> & {
  src?: string | null;
  alt?: string;
  fallback?: React.ReactNode;
};

const SIZE_CLASS = 'size-8';

const Avatar = React.forwardRef<HTMLSpanElement, AvatarProps>(
  ({ className, src, alt = '', fallback, ...props }, ref) => {
    const [status, setStatus] = React.useState<'loading' | 'loaded' | 'error'>('loading');

    // Re-attempt when the source changes.
    React.useEffect(() => {
      setStatus('loading');
    }, [src]);

    const showImage = !!src && status !== 'error';

    return (
      <span
        ref={ref}
        className={cn(
          'relative flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-medium text-muted-foreground',
          SIZE_CLASS,
          className,
        )}
        {...props}
      >
        {showImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={alt}
            onLoad={() => setStatus('loaded')}
            onError={() => setStatus('error')}
            className={cn(
              'absolute inset-0 size-full object-cover transition-opacity duration-fast',
              status === 'loaded' ? 'opacity-100' : 'opacity-0',
            )}
          />
        )}
        {(!showImage || status !== 'loaded') && (fallback ?? initials(alt))}
      </span>
    );
  },
);
Avatar.displayName = 'Avatar';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]!.toUpperCase())
    .join('');
}

export { Avatar };
