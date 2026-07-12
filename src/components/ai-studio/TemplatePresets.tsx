'use client';

import { AI_STUDIO_TEMPLATES, type AiStudioKind, type AiStudioTemplate } from '@/lib/ai-studio/models';

interface TemplatePresetsProps {
  kind: AiStudioKind;
  onSelect: (template: AiStudioTemplate) => void;
}

export function TemplatePresets({ kind, onSelect }: TemplatePresetsProps) {
  const templates = AI_STUDIO_TEMPLATES.filter((t) => t.kind === kind);
  if (templates.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">No presets for this mode yet.</p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {templates.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onSelect(t)}
          className="rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-foreground transition hover:bg-muted"
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
