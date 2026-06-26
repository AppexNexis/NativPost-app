/**
 * Format a large number into a compact human-readable string.
 *
 * Examples:
 *   formatCount(1250000)  // '1.2M'
 *   formatCount(843000)   // '843K'
 *   formatCount(12500)    // '12.5K'
 *   formatCount(999)      // '999'
 */
export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }

  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
  }
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (abs >= 1_000) {
    return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  }
  return String(value);
}

/**
 * Format seconds into a mm:ss or ss display string.
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) {
    return '—';
  }
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m > 0) {
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
  return `${s}s`;
}

/**
 * Capitalize the first letter of a string and replace underscores with spaces.
 */
export function formatLabel(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}
