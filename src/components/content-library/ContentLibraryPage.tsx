"use client";

import React from "react";
import { useRouter } from "next/navigation";

import { ContentLibraryBrowser } from "@/components/content-library/ContentLibraryBrowser";
import type { ContentTemplate } from "@/types/v2";

interface ContentLibraryPageProps {
  templates: ContentTemplate[];
  bookmarkedIds: Set<string>;
}

export function ContentLibraryPage({ templates, bookmarkedIds }: ContentLibraryPageProps) {
  const router = useRouter();
  const [localBookmarks, setLocalBookmarks] = React.useState<Set<string>>(bookmarkedIds);
  const [isRemixing, setIsRemixing] = React.useState<string | null>(null);

  const handleRemix = async (template: ContentTemplate) => {
    if (isRemixing) return;
    setIsRemixing(template.id);

    try {
      // Open the visual remix editor where the user can customize
      // text, layout, media, and audio before generating variants.
      router.push(`/dashboard/content/create?templateId=${template.id}`);
    } catch (err) {
      console.error("[Remix] Failed:", err);
      alert("Remix failed. Please try again.");
    } finally {
      setIsRemixing(null);
    }
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

      {isRemixing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="rounded-xl bg-white p-6 shadow-xl">
            <p className="text-sm font-medium text-gray-900">Remixing template...</p>
          </div>
        </div>
      )}
    </div>
  );
}
