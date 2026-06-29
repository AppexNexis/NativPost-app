import React, { useState } from 'react';
import { AlignLeft, Image, Layers, Music, Wand2 } from 'lucide-react';

import { useEditor } from './EditorContext';
import { TextTab } from './tabs/TextTab';
import { LayoutTab } from './tabs/LayoutTab';
import { MediaTab } from './tabs/MediaTab';
import { AudioTab } from './tabs/AudioTab';

const TABS = [
  { id: 'text', label: 'Text', Icon: AlignLeft },
  { id: 'layout', label: 'Layout', Icon: Layers },
  { id: 'media', label: 'Media', Icon: Image },
  { id: 'audio', label: 'Audio', Icon: Music },
] as const;

type TabId = typeof TABS[number]['id'];

export function EditorSidebar() {
  const { state } = useEditor();
  const [activeTab, setActiveTab] = useState<TabId>('text');

  const isRemix = state.edit?.source === 'remix';
  const contentType = state.edit?.contentType ?? '';
  const displayType = contentType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  return (
    <div className="flex h-full flex-col">
      {/* ── Content type header ─────────────────────────── */}
      <div className="shrink-0 border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            {displayType && (
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                {displayType}
              </span>
            )}
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              {state.aspectRatio}
            </span>
            {isRemix && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                Remix
              </span>
            )}
          </div>
          <button
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            onClick={() => setActiveTab('media')}
            title="Change media"
          >
            <Wand2 className="size-3" />
            Media
          </button>
        </div>
      </div>

      {/* ── Tab nav ─────────────────────────────────────── */}
      <div className="flex shrink-0 border-b border-border">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex flex-1 flex-col items-center gap-0.5 px-2 py-2.5 text-xs font-medium transition-colors ${
              activeTab === id
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="size-4" strokeWidth={1.5} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab content ─────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {activeTab === 'text' && <TextTab />}
        {activeTab === 'layout' && <LayoutTab />}
        {activeTab === 'media' && <MediaTab />}
        {activeTab === 'audio' && <AudioTab />}
      </div>
    </div>
  );
}
