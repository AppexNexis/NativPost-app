import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Underline,
} from 'lucide-react';
import React from 'react';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { getEditorKind } from '@/lib/editor/content-type-registry';
import { EDITOR_FONTS } from '@/lib/editor/fonts';
import { cn } from '@/utils/Helpers';

import { ColorField } from '../ColorField';
import { useEditor } from '../EditorContext';

const TEXT_COLORS = [
  '#ffffff',
  '#000000',
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
];

// Per-line "highlight" backgrounds — a solid box that hugs each wrapped line
// of text (the usefastlane look), rendered via box-decoration-break in every
// preview + engine. "Highlight" (solid black, white text) is the default;
// "None" removes the box and falls back to a soft shadow for legibility.
const TEXT_BG_PRESETS: { label: string; value: string }[] = [
  { label: 'Highlight', value: '#000000' },
  { label: 'White', value: '#ffffff' },
  { label: 'Subtle', value: 'rgba(0,0,0,0.5)' },
  { label: 'None', value: 'transparent' },
];

const CTA_COLORS = [
  'rgba(134, 79, 254, 0.85)',
  '#864FFE',
  '#ef4444',
  '#22c55e',
  '#3b82f6',
  '#f59e0b',
  '#ec4899',
  'rgba(0,0,0,0.7)',
];

// A compact icon/label segmented toggle group — no new radix dependency.
function SegmentedGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label?: string; icon?: React.ReactNode; title?: string }[];
  value: T | undefined;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-border">
      {options.map((opt, i) => (
        <button
          key={opt.value}
          type="button"
          title={opt.title}
          onClick={() => onChange(opt.value)}
          className={cn(
            'flex flex-1 items-center justify-center gap-1 py-2 text-xs font-medium transition-colors',
            i > 0 && 'border-l border-border',
            value === opt.value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          {opt.icon}
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Field({ label, right, children }: { label: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</label>
        {right}
      </div>
      {children}
    </div>
  );
}

export function TextTab() {
  const { state, dispatch } = useEditor();

  const updateScript = (key: string, value: string) =>
    dispatch({ type: 'UPDATE_SCRIPT', payload: { [key]: value } });

  const updateStyle = (key: string, value: unknown) =>
    dispatch({ type: 'UPDATE_STYLE', payload: { [key]: value } });

  const contentType = state.edit?.contentType || 'single_image';
  const kind = getEditorKind(contentType);
  const slideMediaCount = state.mediaSlots?.slides?.length ?? 0;
  const slideCopyCount = state.script?.slideCopy?.length ?? 0;
  // When media slides exist, they are the source of truth — a stale
  // slideCopy from a deleted slide must not resurrect an orphan input.
  // Only fall back to slideCopy length when there are no media slides at
  // all (initial state before Media tab is populated).
  const slideCount = slideMediaCount > 0
    ? slideMediaCount
    : Math.max(slideCopyCount, 1);
  const isPerSlide = kind === 'image' && slideCount > 1;

  const getSlideText = (i: number): string => {
    const entry = state.script?.slideCopy?.[i];
    if (!entry) {
      return '';
    }
    return typeof entry === 'string' ? entry : (entry.text || '');
  };

  const updateSlideText = (i: number, value: string) => {
    const current = state.script?.slideCopy ?? [];
    const next: Array<string | { text: string; durationSeconds?: number }> = [];
    for (let idx = 0; idx < Math.max(slideCount, current.length); idx += 1) {
      if (idx === i) {
        const existing = current[idx];
        if (typeof existing === 'object' && existing !== null) {
          next.push({ ...existing, text: value });
        } else {
          next.push(value);
        }
      } else {
        next.push(current[idx] ?? '');
      }
    }
    dispatch({ type: 'UPDATE_SCRIPT', payload: { slideCopy: next } });
  };

  const textareaClass
    = 'w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

  const fontFamily = state.style.fontFamily || 'Inter';
  const fontSize = state.style.fontSize || 30;
  const dimPct = Math.round((state.style.backgroundDimming ?? 0.3) * 100);
  const mentionOn = (state.script as any).mentionBusiness !== 'false';
  const animationOn = !(state.style as any).noAnimation;

  // Muted one-line preview shown on the collapsed Content header so the copy
  // is legible at a glance without expanding the section.
  const contentPreview = (isPerSlide
    ? getSlideText(0)
    : state.script.hookText || state.script.bodyText || state.script.ctaText || '').trim();

  return (
    <Accordion
      type="multiple"
      defaultValue={['style']}
      className="space-y-1"
    >
      {/* CONTENT */}
      <AccordionItem value="content" className="border-b-0">
        <AccordionTrigger className="py-2 text-xs font-semibold uppercase tracking-wide text-foreground">
          <span className="flex min-w-0 flex-1 items-center gap-2">
            Content
            {contentPreview && (
              <span className="min-w-0 flex-1 truncate text-[11px] font-normal normal-case tracking-normal text-muted-foreground">
                {contentPreview}
              </span>
            )}
          </span>
        </AccordionTrigger>
        <AccordionContent className="pb-3 pt-1">
          <div className="space-y-4 text-foreground">
            {isPerSlide ? (
              <div className="space-y-4">
                {Array.from({ length: slideCount }).map((_, i) => {
                  const value = getSlideText(i);
                  const words = value.trim().split(/\s+/).filter(Boolean).length;
                  return (
                    <Field
                      key={i}
                      label={`Slide ${i + 1}`}
                      right={(
                        <span className="text-[11px] text-muted-foreground">
                          {words}
                          {' '}
                          words
                        </span>
                      )}
                    >
                      <textarea
                        value={value}
                        onChange={e => updateSlideText(i, e.target.value)}
                        rows={3}
                        placeholder={`Caption for slide ${i + 1}…`}
                        className={textareaClass}
                      />
                    </Field>
                  );
                })}
              </div>
            ) : (
              <>
                <Field
                  label="Hook"
                  right={(() => {
                    const words = (state.script.hookText || '').trim().split(/\s+/).filter(Boolean);
                    const isTooLong = words.length > 12;
                    return (
                      <span className={`text-[11px] ${isTooLong ? 'text-amber-600' : 'text-muted-foreground'}`}>
                        {words.length}
                        {' '}
                        words
                        {isTooLong && (
                          <button
                            type="button"
                            onClick={() => updateScript('hookText', words.slice(0, 12).join(' '))}
                            className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 hover:bg-amber-200"
                          >
                            Trim
                          </button>
                        )}
                      </span>
                    );
                  })()}
                >
                  <textarea
                    value={state.script.hookText || ''}
                    onChange={e => updateScript('hookText', e.target.value)}
                    rows={2}
                    placeholder="Grab attention in 3 seconds…"
                    className={textareaClass}
                  />
                </Field>

                <Field label="Body">
                  <textarea
                    value={state.script.bodyText || ''}
                    onChange={e => updateScript('bodyText', e.target.value)}
                    rows={4}
                    placeholder="Main content…"
                    className={textareaClass}
                  />
                </Field>

                <Field label="CTA">
                  <textarea
                    value={state.script.ctaText || ''}
                    onChange={e => updateScript('ctaText', e.target.value)}
                    rows={2}
                    placeholder="Follow for more…"
                    className={textareaClass}
                  />
                </Field>
              </>
            )}

            {/* Mention Business */}
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
              <div>
                <span className="text-xs font-medium text-foreground">Mention business</span>
                <p className="text-[11px] text-muted-foreground">Weave brand name into the copy</p>
              </div>
              <Switch
                checked={mentionOn}
                onCheckedChange={checked => updateScript('mentionBusiness' as any, checked ? 'true' : 'false')}
              />
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* STYLE */}
      <AccordionItem value="style" className="border-b-0">
        <AccordionTrigger className="py-2 text-xs font-semibold uppercase tracking-wide text-foreground">
          Style
        </AccordionTrigger>
        <AccordionContent className="pb-3 pt-1">
          <div className="space-y-3 text-foreground">
            {/* Font */}
            <Field label="Font">
              <Select value={fontFamily} onValueChange={v => updateStyle('fontFamily', v)}>
                <SelectTrigger className="h-9" style={{ fontFamily }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EDITOR_FONTS.map(name => (
                    <SelectItem key={name} value={name} style={{ fontFamily: name }}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {/* Size */}
            <Field
              label="Size"
              right={(
                <span className="text-xs text-muted-foreground">
                  {fontSize}
                  px
                </span>
              )}
            >
              <Slider
                min={16}
                max={120}
                step={1}
                value={[fontSize]}
                onValueChange={vals => updateStyle('fontSize', vals[0] ?? fontSize)}
              />
            </Field>

            {/* Text color */}
            <Field label="Text color">
              <ColorField
                value={state.style.color || '#ffffff'}
                onChange={v => updateStyle('color', v)}
                swatches={TEXT_COLORS}
                fallbackHex="#ffffff"
              />
            </Field>

            {/* Alignment + weight/style */}
            <div className="grid grid-cols-2 gap-2">
              <Field label="Align">
                <SegmentedGroup
                  value={state.style.align as 'left' | 'center' | 'right' | undefined}
                  onChange={v => updateStyle('align', v)}
                  options={[
                    { value: 'left', icon: <AlignLeft className="size-4" />, title: 'Left' },
                    { value: 'center', icon: <AlignCenter className="size-4" />, title: 'Center' },
                    { value: 'right', icon: <AlignRight className="size-4" />, title: 'Right' },
                  ]}
                />
              </Field>
              <Field label="Format">
                <div className="flex overflow-hidden rounded-lg border border-border">
                  <button
                    type="button"
                    title="Bold"
                    onClick={() => updateStyle('weight', state.style.weight === 'bold' ? 'normal' : 'bold')}
                    className={cn(
                      'flex flex-1 items-center justify-center py-2 transition-colors',
                      state.style.weight === 'bold'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <Bold className="size-4" />
                  </button>
                  <button
                    type="button"
                    title="Italic"
                    onClick={() => updateStyle('italic', !state.style.italic)}
                    className={cn(
                      'flex flex-1 items-center justify-center border-l border-border py-2 transition-colors',
                      state.style.italic
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <Italic className="size-4" />
                  </button>
                  <button
                    type="button"
                    title="Underline"
                    onClick={() => updateStyle('underline', !state.style.underline)}
                    className={cn(
                      'flex flex-1 items-center justify-center border-l border-border py-2 transition-colors',
                      state.style.underline
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <Underline className="size-4" />
                  </button>
                </div>
              </Field>
            </div>

            {/* Text background */}
            <Field label="Text background">
              <div className="space-y-2">
                <SegmentedGroup
                  value={(state.style.backgroundColor ?? '#000000') as string}
                  onChange={v => updateStyle('backgroundColor', v)}
                  options={TEXT_BG_PRESETS.map(p => ({ value: p.value, label: p.label }))}
                />
                <ColorField
                  value={(state.style.backgroundColor ?? '#000000') as string}
                  onChange={v => updateStyle('backgroundColor', v)}
                  fallbackHex="#000000"
                />
              </div>
            </Field>

            {/* Background dim */}
            <Field
              label="Background dim"
              right={(
                <span className="text-xs text-muted-foreground">
                  {dimPct}
                  %
                </span>
              )}
            >
              <Slider
                min={0}
                max={80}
                step={1}
                value={[dimPct]}
                onValueChange={vals => updateStyle('backgroundDimming', (vals[0] ?? dimPct) / 100)}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Darkens the source image/video so original text doesn&apos;t bleed through.
              </p>
            </Field>

            {/* CTA button color */}
            <Field label="CTA button color">
              <ColorField
                value={(state.style as any).ctaBackgroundColor || '#864FFE'}
                onChange={v => updateStyle('ctaBackgroundColor', v)}
                swatches={CTA_COLORS}
                fallbackHex="#864FFE"
              />
            </Field>

            {/* Animation — video-only. Slideshow/carousel/data_story swap
                slides on fixed cadence and don't render Remotion's fade-in
                overlays, so the toggle is meaningless there. Gate on editor
                kind rather than hiding via CSS so the setting cannot silently
                persist between remixes. */}
            {kind === 'video' && (
              <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
                <div>
                  <span className="text-xs font-medium text-foreground">Animation</span>
                  <p className="text-[11px] text-muted-foreground">Sequential text fade-in</p>
                </div>
                <Switch
                  checked={animationOn}
                  onCheckedChange={checked => updateStyle('noAnimation', !checked)}
                />
              </div>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
