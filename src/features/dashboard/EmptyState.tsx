import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';

/**
 * Shared empty-state block for dashboard pages.
 *
 * Supports up to two CTAs so surfaces can offer a primary "recommended" path
 * (usually Blitz / auto-generate) and a secondary manual path side by side.
 * Both CTAs accept either an href (Link) or an onClick (button) — mixed is
 * fine (primary link + secondary button, etc.).
 *
 * Kept minimal on purpose: no gradients, no illustration slots, no motion.
 * The whole point is to sit quietly and route the user to a concrete next
 * action, not to be a marketing surface.
 */

type CTA = {
  label: string;
  href?: string;
  onClick?: () => void;
};

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;

  // Preferred API
  primary?: CTA;
  secondary?: CTA;

  // Legacy single-CTA API — kept for backwards compatibility with 5 existing
  // consumers. Prefer `primary` for new code.
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
}

const PRIMARY_CLS
  = 'inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90';

const SECONDARY_CLS
  = 'inline-flex items-center justify-center rounded-lg border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted';

function renderCTA(cta: CTA | undefined, cls: string) {
  if (!cta) return null;
  if (cta.href) {
    return (
      <Link href={cta.href} className={cls}>
        {cta.label}
      </Link>
    );
  }
  if (cta.onClick) {
    return (
      <button type="button" onClick={cta.onClick} className={cls}>
        {cta.label}
      </button>
    );
  }
  return null;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  primary,
  secondary,
  actionLabel,
  actionHref,
  onAction,
}: EmptyStateProps) {
  // Merge legacy props into the primary CTA if the caller used the old API.
  const primaryCTA: CTA | undefined = primary
    ?? (actionLabel
      ? { label: actionLabel, href: actionHref, onClick: onAction }
      : undefined);

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center rounded-xl border border-dashed bg-background p-8 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
        <Icon className="size-6 text-muted-foreground" />
      </div>
      <h3 className="mb-1 text-base font-semibold">{title}</h3>
      <p className="mb-6 max-w-sm text-sm text-muted-foreground">
        {description}
      </p>
      {(primaryCTA || secondary) && (
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-center">
          {renderCTA(primaryCTA, PRIMARY_CLS)}
          {renderCTA(secondary, SECONDARY_CLS)}
        </div>
      )}
    </div>
  );
}
