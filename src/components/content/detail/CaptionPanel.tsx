'use client';

import { Check, Copy, Edit3, Loader2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';

type Props = {
  caption: string;
  hashtags: string[];
  onSave: (caption: string) => Promise<void> | void;
  isSaving?: boolean;
};

export function CaptionPanel({ caption, hashtags, onSave, isSaving = false }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(caption);
  const [copiedCaption, setCopiedCaption] = useState(false);
  const [copiedTags, setCopiedTags] = useState(false);

  const copyCaption = () => {
    navigator.clipboard.writeText(caption);
    setCopiedCaption(true);
    setTimeout(() => setCopiedCaption(false), 1500);
  };

  const copyHashtags = () => {
    navigator.clipboard.writeText(hashtags.join(' '));
    setCopiedTags(true);
    setTimeout(() => setCopiedTags(false), 1500);
  };

  const handleSave = async () => {
    await onSave(draft);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setDraft(caption);
    setIsEditing(false);
  };

  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b pb-3">
        <h3 className="text-sm font-semibold">Caption</h3>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={copyCaption}>
            {copiedCaption ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
            {copiedCaption ? 'Copied' : 'Copy'}
          </Button>
          {!isEditing && (
            <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={() => setIsEditing(true)}>
              <Edit3 className="size-3" />
              Edit
            </Button>
          )}
        </div>
      </div>

      {isEditing
        ? (
            <div>
              <Textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                rows={7}
                className="text-sm leading-relaxed"
              />
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={handleSave} disabled={isSaving}>
                  {isSaving ? <Loader2 className="mr-1.5 size-3 animate-spin" /> : <Check className="mr-1.5 size-3" />}
                  Save changes
                </Button>
                <Button size="sm" variant="ghost" onClick={handleCancel}>Cancel</Button>
              </div>
            </div>
          )
        : caption
          ? <p className="whitespace-pre-wrap text-sm leading-relaxed">{caption}</p>
          : <p className="italic text-sm text-muted-foreground">No caption yet.</p>}

      {hashtags.length > 0 && (
        <div className="mt-4 border-t pt-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {hashtags.length}
              {' '}
              {hashtags.length === 1 ? 'hashtag' : 'hashtags'}
            </span>
            <Button size="sm" variant="ghost" className="h-6 gap-1 px-1.5 text-[11px]" onClick={copyHashtags}>
              {copiedTags ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
              {copiedTags ? 'Copied' : 'Copy all'}
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {hashtags.map(tag => (
              <span key={tag} className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{tag}</span>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
