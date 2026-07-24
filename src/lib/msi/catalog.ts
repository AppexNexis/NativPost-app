// Supported MSI platforms + countries for the order/configure flow (docs §6).
// Launch scope only — expand a platform or country ONLY after it clears its own
// Phase-0 review (docs §15, msi-phase-0-legal-review.md). Pure.

export type CatalogOption = { value: string; label: string };

export const MSI_PLATFORMS: CatalogOption[] = [
  { value: 'tiktok', label: 'TikTok' },
  { value: 'instagram', label: 'Instagram' },
];

export const MSI_COUNTRIES: CatalogOption[] = [
  { value: 'US', label: 'United States' },
  { value: 'UK', label: 'United Kingdom' },
  { value: 'CA', label: 'Canada' },
  { value: 'AU', label: 'Australia' },
  { value: 'FR', label: 'France' },
  { value: 'DE', label: 'Germany' },
  { value: 'ES', label: 'Spain' },
  { value: 'IT', label: 'Italy' },
];

export function isSupportedPlatform(value: string): boolean {
  return MSI_PLATFORMS.some(p => p.value === value);
}

export function isSupportedCountry(value: string): boolean {
  return MSI_COUNTRIES.some(c => c.value === value);
}
