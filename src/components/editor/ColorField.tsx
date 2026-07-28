'use client';

import { HexColorPicker } from 'react-colorful';
import React from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type ColorFieldProps = {
  value?: string;
  onChange: (value: string) => void;
  /**
   * Optional quick-pick swatches shown as a compact strip above the trigger.
   * These may be any CSS color (including rgba() presets) — clicking one sets
   * state directly. react-colorful itself is hex/HSV only, so the popover
   * picker is used for solid hex custom colors.
   */
  swatches?: string[];
  /** Fallback hex shown in the picker when value is not a solid hex. */
  fallbackHex?: string;
};

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function ColorField({ value, onChange, swatches, fallbackHex = '#ffffff' }: ColorFieldProps) {
  const current = value || fallbackHex;
  // react-colorful only understands hex; non-hex presets (rgba/transparent)
  // still display on the trigger chip but the picker opens on fallbackHex.
  const pickerHex = HEX_RE.test(current) ? current : fallbackHex;

  return (
    <div className="space-y-2">
      {swatches && swatches.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {swatches.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => onChange(c)}
              className={`size-6 rounded-full border-2 transition-transform hover:scale-110 ${
                current === c ? 'border-primary scale-110' : 'border-border'
              }`}
              style={{ backgroundColor: c }}
              title={c}
            />
          ))}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="grid size-6 place-items-center rounded-full border-2 border-dashed border-border text-[10px] text-muted-foreground transition-transform hover:scale-110"
                title="Custom color"
              >
                +
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3" align="start">
              <ColorPopoverBody value={pickerHex} onChange={onChange} />
            </PopoverContent>
          </Popover>
        </div>
      )}

      {(!swatches || swatches.length === 0) && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
            >
              <span
                className="size-5 rounded-full border border-white/20"
                style={{ backgroundColor: current }}
              />
              <span className="font-mono text-xs text-muted-foreground">{current}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3" align="start">
            <ColorPopoverBody value={pickerHex} onChange={onChange} />
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

function ColorPopoverBody({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <HexColorPicker color={value} onChange={onChange} />
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        spellCheck={false}
        className="w-full rounded-md border border-border bg-background px-2 py-1 text-center font-mono text-xs text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
    </div>
  );
}
