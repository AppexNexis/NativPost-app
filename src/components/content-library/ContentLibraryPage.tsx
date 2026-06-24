"use client";

import React from "react";
import { ContentLibraryBrowser } from "@/components/content-library/ContentLibraryBrowser";
import type { ContentTemplate } from "@/types/v2";

interface ContentLibraryPageProps {
  templates: ContentTemplate[];
  bookmarkedIds: Set<string>;
}

export function ContentLibraryPage({ templates, bookmarkedIds }: ContentLibraryPageProps) {
  const [localBookmarks, setLocalBookmarks] = React.useState<Set<string>>(bookmarkedIds);

  const handleRemix = (template: ContentTemplate) => {
    // TODO: Open remix flow with template pre-selected
    console.log("Remix template", template.id);
  };

  const handleBookmark = (templateId: string) => {
    setLocalBookmarks((prev) => {
      const next = new Set(prev);
      if (next.has(templateId)) {
        next.delete(templateId);
      } else {
        next.add(templateId);
      }
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Content Library</h1>
        <p className="text-sm text-gray-500">
          Browse, remix, and save trending short-form content. Filter by niche, platform, and content type.
        </p>
      </div>

      <ContentLibraryBrowser
        templates={templates}
        onRemix={handleRemix}
        onBookmark={handleBookmark}
        bookmarkedIds={localBookmarks}
      />
    </div>
  );
}
