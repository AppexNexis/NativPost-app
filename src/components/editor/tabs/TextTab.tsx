import React from 'react';
import { useEditor } from '../EditorContext';

const FONTS = ['Inter', 'Roboto', 'Montserrat', 'Oswald', 'Playfair Display'];

const TEXT_COLORS = [
  '#ffffff', '#000000', '#ef4444', '#f97316', '#f59e0b',
  '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
];

// Three subtle presets — no more full-slab dark backgrounds that covered
// the whole video. "None" is the new default; "Subtle"/"Strong" add a small
// pill behind the text for legibility on busy backgrounds.
const TEXT_BG_PRESETS: { label: string; value: string }[] = [
  { label: 'None',   value: 'transparent' },
  { label: 'Subtle', value: 'rgba(0,0,0,0.25)' },
  { label: 'Strong', value: 'rgba(0,0,0,0.6)' },
];

const CTA_COLORS = [
  'rgba(134, 79, 254, 0.85)', '#864FFE', '#ef4444', '#22c55e',
  '#3b82f6', '#f59e0b', '#ec4899', 'rgba(0,0,0,0.7)',
];

export function TextTab() {
  const { state, dispatch } = useEditor();

  const updateScript = (key: string, value: string) =>
    dispatch({ type: 'UPDATE_SCRIPT', payload: { [key]: value } });

  const updateStyle = (key: string, value: unknown) =>
    dispatch({ type: 'UPDATE_STYLE', payload: { [key]: value } });

  return (
    <div className="space-y-5">
      {/* Hook */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-xs font-medium text-foreground">HOOK</label>
          <div className="flex items-center gap-2">
            {state.timing?.hook?.durationSeconds && (
              <span className="text-[11px] text-muted-foreground">{state.timing.hook.durationSeconds}s</span>
            )}
            {(() => {
              const words = (state.script.hookText || '').trim().split(/\s+/).filter(Boolean);
              const isTooLong = words.length > 12;
              return (
                <span className={`text-[11px] ${isTooLong ? 'text-amber-600' : 'text-muted-foreground'}`}>
                  {words.length} words
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
          </div>
        </div>
        <textarea
          value={state.script.hookText || ''}
          onChange={e => updateScript('hookText', e.target.value)}
          rows={2}
          placeholder="Grab attention in 3 seconds…"
          className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {/* Body */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-xs font-medium text-foreground">BODY</label>
          {state.timing?.body?.durationSeconds && (
            <span className="text-[11px] text-muted-foreground">{state.timing.body.durationSeconds}s</span>
          )}
        </div>
        <textarea
          value={state.script.bodyText || ''}
          onChange={e => updateScript('bodyText', e.target.value)}
          rows={4}
          placeholder="Main content…"
          className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {/* CTA */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-xs font-medium text-foreground">CTA</label>
          {state.timing?.cta?.durationSeconds && (
            <span className="text-[11px] text-muted-foreground">{state.timing.cta.durationSeconds}s</span>
          )}
        </div>
        <textarea
          value={state.script.ctaText || ''}
          onChange={e => updateScript('ctaText', e.target.value)}
          rows={2}
          placeholder="Follow for more…"
          className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {/* Mention Business toggle */}
      <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
        <div>
          <label className="text-xs font-medium text-foreground">MENTION BUSINESS</label>
          <p className="text-[11px] text-muted-foreground">Weave brand name into the copy</p>
        </div>
        <button
          type="button"
          onClick={() => {
            const current = (state.script as any).mentionBusiness !== 'false';
            updateScript('mentionBusiness' as any, current ? 'false' : 'true');
          }}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
            (state.script as any).mentionBusiness !== 'false' ? 'bg-primary' : 'bg-muted-foreground/30'
          }`}
        >
          <span className={`inline-block size-3.5 rounded-full bg-white transition-transform ${
            (state.script as any).mentionBusiness !== 'false' ? 'translate-x-[18px]' : 'translate-x-1'
          }`} />
        </button>
      </div>

      <div className="border-t border-border" />

      {/* Font */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-foreground">FONT</label>
        <select
          value={state.style.fontFamily || 'Inter'}
          onChange={e => updateStyle('fontFamily', e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>

      {/* Size */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-xs font-medium text-foreground">SIZE</label>
          <span className="text-xs text-muted-foreground">{state.style.fontSize || 20}px</span>
        </div>
        <input
          type="range"
          min={16}
          max={120}
          value={state.style.fontSize || 20}
          onChange={e => updateStyle('fontSize', parseInt(e.target.value))}
          className="w-full accent-primary"
        />
      </div>

      {/* Text Color */}
      <div>
        <label className="mb-2 block text-xs font-medium text-foreground">TEXT COLOR</label>
        <div className="flex flex-wrap gap-2">
          {TEXT_COLORS.map(c => (
            <button
              key={c}
              onClick={() => updateStyle('color', c)}
              className={`size-7 rounded-full border-2 transition-transform hover:scale-110 ${
                state.style.color === c ? 'border-primary scale-110' : 'border-border'
              }`}
              style={{ backgroundColor: c }}
              title={c}
            />
          ))}
          <input
            type="color"
            value={state.style.color || '#ffffff'}
            onChange={e => updateStyle('color', e.target.value)}
            className="size-7 cursor-pointer rounded-full border-2 border-border bg-transparent p-0"
            title="Custom color"
          />
        </div>
      </div>

      {/* Text background pill */}
      <div>
        <label className="mb-2 block text-xs font-medium text-foreground">TEXT BACKGROUND</label>
        <div className="flex rounded-lg border border-border overflow-hidden">
          {TEXT_BG_PRESETS.map(preset => (
            <button
              key={preset.label}
              onClick={() => updateStyle('backgroundColor', preset.value)}
              className={`flex-1 py-2 text-xs font-medium transition-colors ${
                state.style.backgroundColor === preset.value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Background dim (full-bleed scrim) — separate from text pill */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-xs font-medium text-foreground">BACKGROUND DIM</label>
          <span className="text-xs text-muted-foreground">
            {Math.round(((state.style as any).backgroundDimming ?? 0.3) * 100)}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={80}
          value={Math.round(((state.style as any).backgroundDimming ?? 0.3) * 100)}
          onChange={e => updateStyle('backgroundDimming', parseInt(e.target.value) / 100)}
          className="w-full accent-primary"
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          Darkens the source image/video so original text doesn't bleed through.
        </p>
      </div>

      {/* Alignment */}
      <div>
        <label className="mb-2 block text-xs font-medium text-foreground">ALIGNMENT</label>
        <div className="flex rounded-lg border border-border overflow-hidden">
          {(['left', 'center', 'right'] as const).map(align => (
            <button
              key={align}
              onClick={() => updateStyle('align', align)}
              className={`flex-1 py-2 text-xs font-medium capitalize transition-colors ${
                state.style.align === align
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {align}
            </button>
          ))}
        </div>
      </div>

      {/* Bold / Italic */}
      <div className="flex gap-2">
        <button
          onClick={() => updateStyle('weight', state.style.weight === 'bold' ? 'normal' : 'bold')}
          className={`flex-1 rounded-lg border py-2 text-sm font-bold transition-colors ${
            state.style.weight === 'bold'
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          B
        </button>
        <button
          onClick={() => updateStyle('italic', !state.style.italic)}
          className={`flex-1 rounded-lg border py-2 text-sm italic transition-colors ${
            state.style.italic
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          I
        </button>
        <button
          onClick={() => updateStyle('underline', !state.style.underline)}
          className={`flex-1 rounded-lg border py-2 text-sm underline transition-colors ${
            state.style.underline
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          U
        </button>
      </div>

      <div className="border-t border-border" />

      {/* CTA Background Color */}
      <div>
        <label className="mb-2 block text-xs font-medium text-foreground">CTA BUTTON COLOR</label>
        <div className="flex flex-wrap gap-2">
          {CTA_COLORS.map((c, i) => (
            <button
              key={i}
              onClick={() => updateStyle('ctaBackgroundColor', c)}
              className={`size-7 rounded-full border-2 transition-transform hover:scale-110 ${
                (state.style as any).ctaBackgroundColor === c ? 'border-primary scale-110' : 'border-border'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
          <input
            type="color"
            value={(state.style as any).ctaBackgroundColor || '#864FFE'}
            onChange={e => updateStyle('ctaBackgroundColor', e.target.value)}
            className="size-7 cursor-pointer rounded-full border-2 border-border bg-transparent p-0"
            title="Custom CTA color"
          />
        </div>
      </div>

      {/* Animation Toggle */}
      <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
        <div>
          <label className="text-xs font-medium text-foreground">ANIMATION</label>
          <p className="text-[11px] text-muted-foreground">Sequential text fade-in</p>
        </div>
        <button
          onClick={() => {
            const current = (state.style as any).noAnimation;
            dispatch({ type: 'UPDATE_STYLE', payload: { noAnimation: !current } });
          }}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
            (state.style as any).noAnimation ? 'bg-muted-foreground/30' : 'bg-primary'
          }`}
        >
          <span className={`inline-block size-3.5 rounded-full bg-white transition-transform ${
            (state.style as any).noAnimation ? 'translate-x-1' : 'translate-x-[18px]'
          }`} />
        </button>
      </div>
    </div>
  );
}
