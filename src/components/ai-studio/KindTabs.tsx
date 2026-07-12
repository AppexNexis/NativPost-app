'use client';

import { ImageIcon, UserCircle, Video, Wand2 } from 'lucide-react';

import { cn } from '@/utils/Helpers';

import type { AiStudioKind } from '@/lib/ai-studio/models';

interface KindTabsProps {
  value: AiStudioKind;
  onChange: (kind: AiStudioKind) => void;
}

const TABS: Array<{ id: AiStudioKind; label: string; icon: typeof ImageIcon }> = [
  { id: 'image', label: 'Image', icon: ImageIcon },
  { id: 'image-edit', label: 'Image Edit', icon: Wand2 },
  { id: 'video', label: 'Video', icon: Video },
  { id: 'video-lipsync', label: 'Talking Head', icon: UserCircle },
];

export function KindTabs({ value, onChange }: KindTabsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition',
              active
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-foreground hover:bg-muted',
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
