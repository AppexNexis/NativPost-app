import { AlertCircle, RefreshCw, X } from 'lucide-react';

/**
 * Inline error banner for recoverable fetch/mutation failures.
 *
 * Per team memory `no-blocking-modal-errors.md`: never overlay a modal for a
 * recoverable error. Compile fail, engine down, save failed — all inline.
 *
 * Tone: acknowledge, name the action, give a way out. Never blame the user.
 * Never dump raw stack traces. The `detail` prop is where the technical
 * message can live if the caller wants it visible for debugging.
 */

interface ErrorBannerProps {
  title: string;
  /** Optional muted second line for context or the raw error message. */
  detail?: string;
  /** Callback for the retry button. Omit to hide the retry button. */
  onRetry?: () => void;
  /** Callback for the dismiss button. Omit to hide the dismiss button. */
  onDismiss?: () => void;
  /**
   * Compact variant collapses padding and hides the icon container. Use
   * inside cards or narrow columns where the standard banner is too tall.
   */
  compact?: boolean;
  className?: string;
}

export function ErrorBanner({
  title,
  detail,
  onRetry,
  onDismiss,
  compact = false,
  className = '',
}: ErrorBannerProps) {
  return (
    <div
      className={`flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/30 ${
        compact ? 'px-3 py-2' : 'px-4 py-3'
      } ${className}`}
      role="alert"
    >
      {!compact && (
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/40">
          <AlertCircle className="size-4 text-red-600 dark:text-red-400" />
        </div>
      )}
      {compact && (
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-600 dark:text-red-400" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-red-900 dark:text-red-100">
          {title}
        </p>
        {detail && (
          <p className="mt-0.5 break-words text-xs text-red-700 dark:text-red-300">
            {detail}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 dark:border-red-800 dark:bg-red-900/40 dark:text-red-100 dark:hover:bg-red-900/60"
          >
            <RefreshCw className="size-3" />
            Retry
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="rounded-md p-1 text-red-700 transition-colors hover:bg-red-100 dark:text-red-300 dark:hover:bg-red-900/40"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
