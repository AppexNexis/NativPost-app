'use client';

import { useMemo } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AI_STUDIO_MODELS, type AiStudioKind, type AiStudioModel } from '@/lib/ai-studio/models';

interface ModelPickerProps {
  kind: AiStudioKind;
  value: string;
  onChange: (modelId: string) => void;
}

export function ModelPicker({ kind, value, onChange }: ModelPickerProps) {
  const models: AiStudioModel[] = useMemo(
    () => AI_STUDIO_MODELS.filter((m) => m.kind === kind),
    [kind],
  );

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full sm:w-[220px]">
        <SelectValue placeholder="Select model" />
      </SelectTrigger>
      <SelectContent>
        {models.map((m) => (
          <SelectItem key={m.id} value={m.id}>
            <div className="flex w-full items-center justify-between gap-3">
              <span>{m.label}</span>
              <span className="text-xs text-muted-foreground">{m.credits} credits</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
