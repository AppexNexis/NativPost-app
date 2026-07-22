/**
 * Canonical social-platform metadata — the single source of truth.
 *
 * Every surface (dashboard, analytics, approvals, settings, campaign wizard,
 * content detail) reads labels and colors from here so a platform rename or
 * brand-color change is a one-file edit. Before this module existed the same
 * maps were re-declared in six files and had already drifted (e.g. twitter
 * was "X", "X / Twitter", and "X (Twitter)" in different screens).
 */

export type PlatformKey =
  | 'instagram'
  | 'linkedin'
  | 'linkedin_page'
  | 'twitter'
  | 'facebook'
  | 'tiktok'
  | 'youtube'
  | 'threads'
  | 'pinterest'
  | 'snapchat'
  | 'whatsapp';

export type PlatformMeta = {
  label: string;
  /** Tailwind bg-* class for dots/chips — brand-adjacent, dark-mode safe. */
  color: string;
};

export const PLATFORMS: Record<PlatformKey, PlatformMeta> = {
  instagram: { label: 'Instagram', color: 'bg-pink-500' },
  linkedin: { label: 'LinkedIn', color: 'bg-blue-600' },
  linkedin_page: { label: 'LinkedIn Page', color: 'bg-blue-700' },
  twitter: { label: 'X', color: 'bg-zinc-800' },
  facebook: { label: 'Facebook', color: 'bg-blue-500' },
  tiktok: { label: 'TikTok', color: 'bg-zinc-900' },
  youtube: { label: 'YouTube', color: 'bg-red-600' },
  threads: { label: 'Threads', color: 'bg-zinc-700' },
  pinterest: { label: 'Pinterest', color: 'bg-red-500' },
  snapchat: { label: 'Snapchat', color: 'bg-yellow-400' },
  whatsapp: { label: 'WhatsApp', color: 'bg-green-500' },
};

/** Label for a platform key; falls back to the raw key for unknown values. */
export function platformLabel(platform: string): string {
  return PLATFORMS[platform as PlatformKey]?.label ?? platform;
}

/** Dot/chip color class for a platform key; neutral fallback. */
export function platformColor(platform: string): string {
  return PLATFORMS[platform as PlatformKey]?.color ?? 'bg-zinc-500';
}

/** Flat label map for call sites that index directly. */
export const PLATFORM_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(PLATFORMS).map(([key, meta]) => [key, meta.label]),
);

/** Flat color map for call sites that index directly. */
export const PLATFORM_COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(PLATFORMS).map(([key, meta]) => [key, meta.color]),
);
