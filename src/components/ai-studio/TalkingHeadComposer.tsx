'use client';

import { Loader2, Music, Sparkles } from 'lucide-react';
import { useState } from 'react';

import { AudioSelectModal } from '@/components/media/AudioSelectModal';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { AI_STUDIO_MODELS, estimateCredits, getModel } from '@/lib/ai-studio/models';

import { type AspectRatio, AspectRatioPicker } from './AspectRatioPicker';
import { DurationSlider } from './DurationSlider';
import { ReferenceImageSlot } from './ReferenceImageSlot';

type TalkingHeadComposerProps = {
  onSubmit: (payload: {
    prompt: string;
    imageUrl: string;
    audioUrl: string;
    i2vModelId: string;
    aspect: AspectRatio;
    duration: number;
  }) => void;
  submitting: boolean;
};

export function TalkingHeadComposer({ onSubmit, submitting }: TalkingHeadComposerProps) {
  const [prompt, setPrompt] = useState('');
  const [imageUrl, setImageUrl] = useState<string | undefined>();
  const [audioUrl, setAudioUrl] = useState<string | undefined>();
  const [i2vModelId, setI2vModelId] = useState('pixverse-v6-i2v');
  const [aspect, setAspect] = useState<AspectRatio>('9:16');
  const [duration, setDuration] = useState(5);
  const [audioPickerOpen, setAudioPickerOpen] = useState(false);

  const videoModels = AI_STUDIO_MODELS.filter(m => m.kind === 'video');
  const model = getModel(i2vModelId);
  const lipsync = getModel('veed-lipsync');
  const durations = model?.durations ?? [5];
  const aspects = (model?.aspects ?? ['9:16', '1:1', '16:9']) as AspectRatio[];
  const credits = (model ? estimateCredits(model, { seconds: duration }) : 0)
    + (lipsync ? estimateCredits(lipsync) : 0);
  const disabled = submitting || !prompt.trim() || !imageUrl || !audioUrl;

  return (
    <div className="rounded-lg border border-border bg-background p-4 shadow-sm">
      <div className="flex flex-col gap-3">
        <Textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="Describe the motion for the source frame..."
          rows={3}
          className="resize-none bg-background"
        />

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Source frame</span>
            <ReferenceImageSlot value={imageUrl} onChange={setImageUrl} />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Audio track</span>
            {audioUrl ? (
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-2 py-1 text-xs">
                <Music className="size-3" />
                <span className="max-w-[160px] truncate">{audioUrl.split('/').pop()}</span>
                <button
                  type="button"
                  onClick={() => setAudioUrl(undefined)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Remove
                </button>
              </div>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setAudioPickerOpen(true)}
              >
                <Music className="mr-1 size-3" />
                {' '}
                Pick audio
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={i2vModelId}
            onChange={e => setI2vModelId(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
          >
            {videoModels.map(m => (
              <option key={m.id} value={m.id}>
                {m.label}
                {' '}
                (
                {m.credits}
                {m.perSecond ? '/sec' : ''}
                {' '}
                credits)
              </option>
            ))}
          </select>
          <AspectRatioPicker aspects={aspects} value={aspect} onChange={setAspect} />
          <DurationSlider durations={durations} value={duration} onChange={setDuration} />
          <div className="ml-auto">
            <Button
              onClick={() => {
                if (!imageUrl || !audioUrl) {
                  return;
                }
                onSubmit({ prompt, imageUrl, audioUrl, i2vModelId, aspect, duration });
              }}
              disabled={disabled}
              size="lg"
            >
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

      {audioPickerOpen && (
        <AudioSelectModal
          onClose={() => setAudioPickerOpen(false)}
          onSelect={(track) => {
            setAudioUrl(track.url);
            setAudioPickerOpen(false);
          }}
          title="Pick audio track"
        />
      )}
    </div>
  );
}
