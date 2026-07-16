'use client';

import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/utils/Helpers';

type BackHeaderProps = {
  href: string;
  label?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  className?: string;
};

// Consistent chrome across AI Studio surfaces: back arrow + title + right slot.
// Uses design-system tokens only.
export function BackHeader({
  href,
  label = 'Back',
  title,
  subtitle,
  right,
  className,
}: BackHeaderProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 border-b bg-background/80 px-4 py-3 backdrop-blur sm:px-6',
        className,
      )}
    >
      <Link
        href={href}
        className={cn(
          'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground',
          'transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring',
        )}
      >
        <ChevronLeft className="h-4 w-4" />
        <span>{label}</span>
      </Link>
      {(title || subtitle) && (
        <div className="min-w-0 flex-1">
          {title && (
            <div className="truncate text-sm font-medium text-foreground">{title}</div>
          )}
          {subtitle && (
            <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
          )}
        </div>
      )}
      {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
    </div>
  );
}
