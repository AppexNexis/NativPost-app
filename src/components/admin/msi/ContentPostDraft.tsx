'use client';

import { ChevronDown, Loader2, PenLine } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

type Draft = {
  jobId: string;
  contentItemId: string;
  topic: string | null;
  caption: string;
  contentType: string;
  graphicUrls: string[];
};

const CONTENT_TYPES = ['image', 'video', 'text', 'carousel'];

// Operator drafting panel for a content_post job (Managed Posting, docs §19).
// Reads the customer's brief, lets the operator write the post, and saves it
// onto the linked content_item. Approval + publish stay in JobActions.
export function ContentPostDraft({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [caption, setCaption] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [contentType, setContentType] = useState('image');

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (draft) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/msi/jobs/${jobId}/draft`);
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }
      const d: Draft = await res.json();
      setDraft(d);
      setCaption(d.caption);
      setImageUrl(d.graphicUrls[0] ?? '');
      setContentType(d.contentType || 'image');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load draft');
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/msi/jobs/${jobId}/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caption,
          contentType,
          graphicUrls: imageUrl.trim() ? [imageUrl.trim()] : [],
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || `Server returned ${res.status}`);
      }
      toast.success('Draft saved');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      <button
        type="button"
        onClick={toggle}
        className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
      >
        <PenLine className="size-3.5" />
        Draft this post
        <ChevronDown className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Loading brief…
            </div>
          ) : draft ? (
            <>
              {draft.topic && (
                <div className="rounded-md bg-muted/50 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Brief</p>
                  <p className="mt-0.5 text-xs text-foreground">{draft.topic}</p>
                </div>
              )}

              <div>
                <label htmlFor={`ct-${jobId}`} className="mb-1 block text-[11px] font-medium text-muted-foreground">
                  Content type
                </label>
                <select
                  id={`ct-${jobId}`}
                  value={contentType}
                  onChange={e => setContentType(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs"
                >
                  {CONTENT_TYPES.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor={`cap-${jobId}`} className="mb-1 block text-[11px] font-medium text-muted-foreground">
                  Caption
                </label>
                <textarea
                  id={`cap-${jobId}`}
                  value={caption}
                  onChange={e => setCaption(e.target.value)}
                  rows={3}
                  className="w-full resize-y rounded-md border border-border bg-background px-2.5 py-1.5 text-xs"
                />
              </div>

              <div>
                <label htmlFor={`img-${jobId}`} className="mb-1 block text-[11px] font-medium text-muted-foreground">
                  Image / video URL
                </label>
                <input
                  id={`img-${jobId}`}
                  value={imageUrl}
                  onChange={e => setImageUrl(e.target.value)}
                  placeholder="https://…"
                  className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs"
                />
              </div>

              <Button size="sm" disabled={saving} onClick={save} className="gap-1.5">
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Save draft
              </Button>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
