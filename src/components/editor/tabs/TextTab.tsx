import React from 'react';
import { useEditor } from '../EditorContext';

const FONTS = ['Inter', 'Roboto', 'Montserrat', 'Oswald', 'Playfair Display'];

const TEXT_COLORS = [
  '#ffffff', '#000000', '#ef4444', '#f97316', '#f59e0b',
  '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
];

const BG_COLORS = [
  'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.7)', '#000000',
  'rgba(255,255,255,0.15)', 'rgba(255,255,255,0)',
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
          {state.timing?.hook?.durationSeconds && (
            <span className="text-[11px] text-muted-foreground">{state.timing.hook.durationSeconds}s</span>
          )}
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

      {/* Background */}
      <div>
        <label className="mb-2 block text-xs font-medium text-foreground">BACKGROUND</label>
        <div className="flex flex-wrap gap-2">
          {BG_COLORS.map((c, i) => (
            <button
              key={i}
              onClick={() => updateStyle('backgroundColor', c)}
              className={`size-7 rounded-full border-2 transition-transform hover:scale-110 ${
                state.style.backgroundColor === c ? 'border-primary scale-110' : 'border-border'
              }`}
              style={{ backgroundColor: c === 'rgba(255,255,255,0)' ? 'transparent' : c }}
              title={i === 4 ? 'None' : c}
            />
          ))}
        </div>
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
    </div>
  );
}
