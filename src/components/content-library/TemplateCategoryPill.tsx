import type { ContentTemplate } from '@/types/v2';
import { formatLabel } from '@/utils/format';

type TemplateCategoryPillProps = {
  template: ContentTemplate;
  className?: string;
};

export function TemplateCategoryPill({ template, className = '' }: TemplateCategoryPillProps) {
  // Prefer the first niche as the primary category; fall back to content type.
  const label = template.niches[0]
    ? formatLabel(template.niches[0])
    : formatLabel(template.contentType);

  return (
    <span
      className={`inline-flex items-center rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm ${className}`}
    >
      {label}
    </span>
  );
}
