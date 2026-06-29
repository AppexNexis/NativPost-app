import React, { useState } from 'react';
import { AlignLeft, Image, Layers, Music, RefreshCw } from 'lucide-react';

import { useEditor } from './EditorContext';
import { TextTab } from './tabs/TextTab';
import { LayoutTab } from './tabs/LayoutTab';
import { MediaTab } from './tabs/MediaTab';
import { AudioTab } from './tabs/AudioTab';

// ── Tab definitions ──────────────────────────────────────────────
type TabDef = {
  id: string;
  label: string;
  Icon: typeof AlignLeft;
};

const ALL_TABS: TabDef[] = [
  { id: 'text', label: 'Text', Icon: AlignLeft },
  { id: 'layout', label: 'Layout', Icon: Layers },
  { id: 'media', label: 'Media', Icon: Image },
  { id: 'audio', label: 'Audio', Icon: Music },
];

// Content types that skip some tabs
const TABS_BY_CONTENT_TYPE: Record<string, string[]> = {
  text_only: ['text'],
  single_image: ['text', 'media'],
  slideshow: ['text', 'layout', 'media', 'audio'],
  reel: ['text', 'layout', 'media', 'audio'],
  ugc: ['text', 'layout', 'media', 'audio'],
  data_story: ['text', 'layout', 'media', 'audio'],
  wall_of_text: ['text', 'layout', 'audio'],
  talking_head: ['text', 'layout', 'media', 'audio'],
  green_screen: ['text', 'layout', 'media', 'audio'],
};

type TabId = (typeof ALL_TABS)[number]['id'];

// ── Content type descriptions ────────────────────────────────────
const CT_LABELS: Record<string, string> = {
  text_only: 'Text',
  single_image: 'Image',
  slideshow: 'Slideshow',
  reel: 'Video',
  ugc: 'UGC',
  data_story: 'Data Story',
  wall_of_text: 'Wall of Text',
  talking_head: 'Talking Head',
  green_screen: 'Green Screen',
};

export function EditorSidebar() {
  const { state } = useEditor();
  const contentType = state.edit?.contentType ?? 'text_only';
  const isRemix = state.edit?.source === 'remix';

  const availableTabs = TABS_BY_CONTENT_TYPE[contentType] || ['text', 'layout', 'media', 'audio'];
  const [activeTab, setActiveTab] = useState<TabId>(availableTabs[0] as TabId);

  // Sync active tab when content type changes
  React.useEffect(() => {
    if (!availableTabs.includes(activeTab)) {
      setActiveTab(availableTabs[0] as TabId);
    }
  }, [contentType]);

  const displayLabel = CT_LABELS[contentType] || contentType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  const renderTabContent = () => {
    switch (activeTab) {
      case 'text': return <TextTab />;
      case 'layout': return <LayoutTab />;
      case 'media': return <MediaTab />;
      case 'audio': return <AudioTab />;
      default: return null;
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* ── Header ─────────────────────────────────── */}
      <div className="shrink-0 border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
              {displayLabel}
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              {state.aspectRatio}
            </span>
            {isRemix && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                Remix
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────── */}
      <div className="flex shrink-0 gap-0.5 border-b border-border px-3 pt-2">
        {ALL_TABS.filter(tab => availableTabs.includes(tab.id)).map(tab => {
          const Icon = tab.Icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabId)}
              className={`flex items-center gap-1.5 border-b-2 px-3 pb-2 pt-1 text-xs font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="size-3.5" strokeWidth={1.5} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Tab content ────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {renderTabContent()}
      </div>

      {/* ── Template info (bottom section) ─────────── */}
      {state.edit?.templateId && (
        <div className="shrink-0 border-t border-border bg-muted/20 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-medium text-foreground">
                {state.edit.templateId.slice(0, 8)}...
              </p>
              <p className="truncate text-[10px] text-muted-foreground">
                {displayLabel} &middot; {state.aspectRatio}
              </p>
            </div>
            <button
              type="button"
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors hover:bg-muted"
              onClick={() => {
                const mediaTab = document.querySelector('[data-tab-id="media"]');
                if (mediaTab instanceof HTMLElement) mediaTab.click();
                setActiveTab('media' as TabId);
              }}
            >
              <RefreshCw className="size-3" />
              Change
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
