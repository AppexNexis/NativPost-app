import { Loader2 } from 'lucide-react';

/**
 * Shared loading block for dashboard fetches.
 *
 * Per team memory `long-running-progress.md`: for anything above ~5s, show a
 * concrete message (or a step count) instead of a lonely spinner. For short
 * fetches, a spinner + one-line context is still miles better than a bare
 * spinner with no label.
 *
 * Kept intentionally simple — no illustration, no progress bar, no fake
 * percentages. If a caller has real percent-complete data, they should render
 * their own progress UI rather than reuse this.
 */

type LoadingStateProps = {
  message?: string;
  /**
   * Optional hint shown under the message in muted text. Good for context
   * like "This can take up to 20 seconds" so the user does not think the
   * app has hung.
   */
  hint?: string;
  /** Height class for the container. Defaults to a comfy 400px minimum. */
  minHeightClass?: string;
};

export function LoadingState({
  message = 'Loading',
  hint,
  minHeightClass = 'min-h-[400px]',
}: LoadingStateProps) {
  return (
    <div className={`flex ${minHeightClass} flex-col items-center justify-center gap-3 text-center`}>
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
      <div className="space-y-1">
        <p className="text-body font-medium text-foreground">{message}</p>
        {hint && (
          <p className="text-meta text-muted-foreground">{hint}</p>
        )}
      </div>
    </div>
  );
}
