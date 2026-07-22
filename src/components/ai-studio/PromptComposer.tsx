'use client';

import { Loader2, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Textarea } from '@/components/ui/textarea';
import { type AiStudioKind, estimateCredits, getModel } from '@/lib/ai-studio/models';

import { type AspectRatio, AspectRatioPicker } from './AspectRatioPicker';
import { DurationSlider } from './DurationSlider';
import { ModelPicker } from './ModelPicker';
import { ReferenceImageSlot } from './ReferenceImageSlot';

type PromptComposerProps = {
  kind: AiStudioKind;
  modelId: string;
  onModelChange: (id: string) => void;
  prompt: string;
  onPromptChange: (v: string) => void;
  aspect: AspectRatio;
  onAspectChange: (a: AspectRatio) => void;
  duration: number;
  onDurationChange: (d: number) => void;
  references: string[];
  onReferencesChange: (r: string[]) => void;
  onSubmit: () => void;
  submitting: boolean;
};

export function PromptComposer(props: PromptComposerProps) {
  const {
    kind,
    modelId,
    onModelChange,
    prompt,
    onPromptChange,
    aspect,
    onAspectChange,
    duration,
    onDurationChange,
    references,
    onReferencesChange,
    onSubmit,
    submitting,
  } = props;

  const model = getModel(modelId);
  const credits = model ? estimateCredits(model, { seconds: duration }) : 0;
  const needsImage = model?.requiresImage;
  const missingImage = needsImage && references.length === 0;
  const disabled = submitting || !prompt.trim() || missingImage;
  const aspects = (model?.aspects ?? ['1:1', '9:16', '16:9']) as AspectRatio[];
  const durations = model?.durations ?? [];

  function setReferenceAt(idx: number, url: string | undefined) {
    const next = [...references];
    if (url) {
      next[idx] = url;
    } else {
      next.splice(idx, 1);
    }
    onReferencesChange(next.filter(Boolean));
  }

  return (
    <div className="rounded-lg border border-border bg-background p-4 shadow-elevation-2">
      <div className="flex flex-col gap-3">
        <Textarea
          value={prompt}
          onChange={e => onPromptChange(e.target.value)}
          onKeyDown={(e) => {
            // ⌘/Ctrl+Enter generates without leaving the prompt.
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !disabled) {
              e.preventDefault();
              onSubmit();
            }
          }}
          placeholder="Describe what you want to create..."
          rows={3}
          className="resize-none bg-background"
        />

        {needsImage && (
          <div className="flex flex-wrap gap-2">
            {[0, 1, 2, 3].map((idx) => {
              if (idx > references.length) {
                return null;
              }
              return (
                <ReferenceImageSlot
                  key={idx}
                  value={references[idx]}
                  onChange={url => setReferenceAt(idx, url)}
                />
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <ModelPicker kind={kind} value={modelId} onChange={onModelChange} />
          <AspectRatioPicker aspects={aspects} value={aspect} onChange={onAspectChange} />
          {kind === 'video' && durations.length > 0 && (
            <DurationSlider durations={durations} value={duration} onChange={onDurationChange} />
          )}
          <div className="ml-auto flex items-center gap-2.5">
            <Kbd className="hidden bg-background sm:inline-flex">⌘↵</Kbd>
            <Button onClick={onSubmit} disabled={disabled} size="lg">
              {submitting ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 size-4" />
              )}
              Generate (
              {credits}
              {' '}
              credits)
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
