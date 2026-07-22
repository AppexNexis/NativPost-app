'use client';

import { ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/utils/Helpers';

// Content types the user can filter by (matches Blitz + campaign types).
const CONTENT_TYPES = [
  { value: 'text_only', label: 'Text' },
  { value: 'single_image', label: 'Image' },
  { value: 'carousel', label: 'Carousel' },
  { value: 'slideshow', label: 'Slideshow' },
  { value: 'talking_head', label: 'Talking Head' },
  { value: 'ugc', label: 'UGC' },
  { value: 'video_hook', label: 'Video Hook' },
  { value: 'video_hook_demo', label: 'Video Hook Demo' },
  { value: 'green_screen', label: 'Green Screen' },
  { value: 'reel', label: 'Reel' },
];

const PLATFORMS = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'x', label: 'X (Twitter)' },
  { value: 'linkedin', label: 'LinkedIn' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'scheduled', label: 'Scheduled first' },
  { value: 'quality', label: 'Highest quality' },
];

type Props = {
  search: string;
  onSearchChange: (v: string) => void;
  contentTypes: string[];
  onContentTypesChange: (v: string[]) => void;
  platforms: string[];
  onPlatformsChange: (v: string[]) => void;
  sort: string;
  onSortChange: (v: string) => void;
};

export function PostsFilters({
  search,
  onSearchChange,
  contentTypes,
  onContentTypesChange,
  platforms,
  onPlatformsChange,
  sort,
  onSortChange,
}: Props) {
  // Debounced search — commit after 300ms of no keystrokes.
  const [localSearch, setLocalSearch] = useState(search);
  useEffect(() => {
    setLocalSearch(search);
  }, [search]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (localSearch !== search) {
        onSearchChange(localSearch);
      }
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localSearch]);

  const toggleContentType = (value: string) => {
    if (contentTypes.includes(value)) {
      onContentTypesChange(contentTypes.filter(v => v !== value));
    } else {
      onContentTypesChange([...contentTypes, value]);
    }
  };
  const togglePlatform = (value: string) => {
    if (platforms.includes(value)) {
      onPlatformsChange(platforms.filter(v => v !== value));
    } else {
      onPlatformsChange([...platforms, value]);
    }
  };

  const activeFilterCount = contentTypes.length + platforms.length;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {/* Search */}
      <div className="relative min-w-0 flex-1 sm:max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={localSearch}
          onChange={e => setLocalSearch(e.target.value)}
          placeholder="Search captions..."
          className="h-9 w-full rounded-md border bg-background px-8 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {localSearch && (
          <button
            type="button"
            onClick={() => setLocalSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {/* Content type multi-select */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs">
            Type
            {contentTypes.length > 0 && (
              <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                {contentTypes.length}
              </span>
            )}
            <ChevronDown className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
          <DropdownMenuLabel>Content type</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {CONTENT_TYPES.map(t => (
            <DropdownMenuCheckboxItem
              key={t.value}
              checked={contentTypes.includes(t.value)}
              onCheckedChange={() => toggleContentType(t.value)}
            >
              {t.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Platform multi-select */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs">
            Platform
            {platforms.length > 0 && (
              <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                {platforms.length}
              </span>
            )}
            <ChevronDown className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Platform</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {PLATFORMS.map(p => (
            <DropdownMenuCheckboxItem
              key={p.value}
              checked={platforms.includes(p.value)}
              onCheckedChange={() => togglePlatform(p.value)}
            >
              {p.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Sort */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs">
            <SlidersHorizontal className="size-3" />
            {SORT_OPTIONS.find(s => s.value === sort)?.label || 'Sort'}
            <ChevronDown className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Sort by</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup value={sort} onValueChange={onSortChange}>
            {SORT_OPTIONS.map(s => (
              <DropdownMenuRadioItem key={s.value} value={s.value}>
                {s.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Clear all filters */}
      {activeFilterCount > 0 && (
        <button
          type="button"
          onClick={() => {
            onContentTypesChange([]);
            onPlatformsChange([]);
          }}
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-2 py-1 text-micro font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
          )}
        >
          <X className="size-3" />
          Clear
        </button>
      )}
    </div>
  );
}
