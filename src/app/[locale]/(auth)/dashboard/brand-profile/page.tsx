'use client';

import {
  ExternalLink,
  Globe,
  Loader2,
  MessageSquare,
  Palette,
  Pencil,
  Play,
  Plus,
  Sparkles,
  Trash2,
  User,
  X,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import type { ContentAngle } from '@/types/v2';

import { useBrandProfile } from '@/features/brand-profile/useBrandProfile';
import { EmptyState } from '@/features/dashboard/EmptyState';
import { PageHeader } from '@/features/dashboard/PageHeader';

const GROWTH_STAGE_LABELS: Record<string, string> = {
  early: '0 – 1K followers',
  growing: '1K – 20K followers',
  established: '20K – 100K followers',
  authority: '100K+ followers',
};

export default function BrandProfilePage() {
  const { data, isLoading, hasProfile, profileCompleteness } = useBrandProfile();

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!hasProfile) {
    return (
      <>
        <PageHeader
          title="Brand Profile"
          description="NativPost uses your Brand Profile to generate content that matches your voice, style, and strategy."
        />
        {/* Video tutorial placeholder */}
        <SetupCallBanner />
        <EmptyState
          icon={Palette}
          title="Teach NativPost your brand voice"
          description="Paste a website, a social profile, or describe your business — we\u2019ll extract your voice, audience, and offering so every post sounds like you."
          primary={{ label: 'Set up Brand Profile', href: '/dashboard/brand-profile/onboarding' }}
          secondary={{ label: 'Watch a 60s tour', href: '/dashboard/support' }}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Brand Profile"
        description="NativPost uses this profile to generate content that matches your voice, style, and strategy."
        actions={(
          <Link
            href="/dashboard/brand-profile/onboarding"
            className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            <Pencil className="size-4" />
            Edit
          </Link>
        )}
      />

      {/* Completeness indicator */}
      <div className="mb-6 rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Profile completeness</span>
          <span className={`font-semibold tabular-nums ${profileCompleteness >= 80 ? 'text-green-600' : 'text-amber-600'}`}>
            {profileCompleteness}
            %
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all duration-500 ${profileCompleteness >= 80 ? 'bg-green-600' : 'bg-amber-500'}`}
            style={{ width: `${profileCompleteness}%` }}
          />
        </div>
        {profileCompleteness < 80 && (
          <p className="mt-2 text-xs text-muted-foreground">
            A more complete profile produces higher-quality content.
            {' '}
            <Link href="/dashboard/brand-profile/onboarding" className="font-medium underline underline-offset-2">
              Continue editing
            </Link>
          </p>
        )}
      </div>

      {/* Profile cards */}
      <div className="grid gap-4 sm:grid-cols-2">

        {/* Business basics */}
        <ProfileCard icon={User} title="Business basics">
          <ProfileField label="Brand name" value={data.brandName} />
          <ProfileField label="Industry" value={data.industry} />
          {data.websiteUrl && (
            <div>
              <span className="text-xs text-muted-foreground">Website</span>
              <a
                href={data.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-0.5 flex items-center gap-1 text-sm text-primary hover:underline"
              >
                {data.websiteUrl}
                <ExternalLink className="size-3" />
              </a>
            </div>
          )}
          {data.targetAudience && <ProfileField label="Target audience" value={data.targetAudience} truncate />}
          {data.companyDescription && <ProfileField label="Description" value={data.companyDescription} truncate />}
          {data.growthStage && (
            <div>
              <span className="text-xs text-muted-foreground">Growth stage</span>
              <p className="mt-0.5 text-sm">
                {GROWTH_STAGE_LABELS[data.growthStage] || data.growthStage}
              </p>
            </div>
          )}
        </ProfileCard>

        {/* Voice & tone */}
        <ProfileCard icon={MessageSquare} title="Voice & tone">
          <div className="grid grid-cols-3 gap-3">
            <ToneMeter label="Formality" value={data.toneFormality} />
            <ToneMeter label="Humor" value={data.toneHumor} />
            <ToneMeter label="Energy" value={data.toneEnergy} />
          </div>
          {data.communicationStyle && <ProfileField label="Style" value={data.communicationStyle} truncate />}
          {data.vocabulary.length > 0 && (
            <TagList label="Preferred" tags={data.vocabulary} variant="neutral" />
          )}
          {data.forbiddenWords.length > 0 && (
            <TagList label="Excluded" tags={data.forbiddenWords} variant="destructive" />
          )}
        </ProfileCard>

        {/* Visual identity */}
        <ProfileCard icon={Palette} title="Visual identity">
          {[data.primaryColor, data.secondaryColor, data.accentColor].some(Boolean) && (
            <div>
              <span className="text-xs text-muted-foreground">Colors</span>
              <div className="mt-1.5 flex items-center gap-3">
                {[data.primaryColor, data.secondaryColor, data.accentColor].filter(Boolean).map((c, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <div className="size-6 rounded border shadow-sm" style={{ backgroundColor: c }} />
                    <span className="font-mono text-xs text-muted-foreground">{c}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {data.imageStyle && <ProfileField label="Image aesthetic" value={data.imageStyle} />}
          {data.fontPreference && <ProfileField label="Typography" value={data.fontPreference} />}
          {data.logoUrl && (
            <div>
              <span className="text-xs text-muted-foreground">Logo</span>
              <div className="mt-1.5">
                <Image
                  src={data.logoUrl}
                  alt="Brand logo"
                  width={80}
                  height={32}
                  unoptimized
                  className="max-h-8 w-auto rounded border object-contain"
                />
              </div>
            </div>
          )}
        </ProfileCard>

        {/* Content preferences */}
        <ProfileCard icon={Sparkles} title="Content preferences">
          {data.contentExamples.length > 0 && (
            <TagList label="References" tags={data.contentExamples} variant="neutral" />
          )}
          {data.antiPatterns.length > 0 && (
            <TagList label="Avoid" tags={data.antiPatterns} variant="destructive" />
          )}
          {data.hashtagStrategy && (
            <ProfileField label="Hashtag strategy" value={data.hashtagStrategy} truncate />
          )}
          {!data.contentExamples.length && !data.antiPatterns.length && !data.hashtagStrategy && (
            <p className="text-xs text-muted-foreground">No content preferences configured.</p>
          )}
        </ProfileCard>

        {/* Platform voices — full width */}
        <div className="sm:col-span-2">
          <ProfileCard icon={Globe} title="Platform voices">
            {[
              { label: 'LinkedIn', value: data.linkedinVoice },
              { label: 'Instagram', value: data.instagramVoice },
              { label: 'X / Twitter', value: data.twitterVoice },
              { label: 'Facebook', value: data.facebookVoice },
              { label: 'TikTok', value: data.tiktokVoice },
            ].filter(p => p.value).length > 0
              ? (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {[
                      { label: 'LinkedIn', value: data.linkedinVoice },
                      { label: 'Instagram', value: data.instagramVoice },
                      { label: 'X / Twitter', value: data.twitterVoice },
                      { label: 'Facebook', value: data.facebookVoice },
                      { label: 'TikTok', value: data.tiktokVoice },
                    ]
                      .filter(p => p.value)
                      .map(p => (
                        <div key={p.label} className="rounded-lg border bg-muted/30 p-3">
                          <span className="text-xs font-semibold">{p.label}</span>
                          <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{p.value}</p>
                        </div>
                      ))}
                  </div>
                )
              : (
                  <p className="text-xs text-muted-foreground">No platform-specific voices configured.</p>
                )}
          </ProfileCard>
        </div>
      </div>

      {/* Content Angles */}
      <ContentAnglesSection />
    </>
  );
}

// ── Setup call banner (replaces video tutorial until ready) ──
function SetupCallBanner() {
  return (
    <div className="mb-6 flex items-center gap-4 rounded-xl border bg-card p-4">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted">
        <Play className="size-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Need help filling in your Brand Profile?</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Book a 20-minute setup call and a member of the NativPost team will complete it with you.
        </p>
      </div>
      <a
        href="https://cal.com/nativpost/onboarding"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted"
      >
        Book a call
        <ExternalLink className="size-3" />
      </a>
    </div>
  );
}

// ============================================================
// SUB-COMPONENTS
// ============================================================

function ProfileCard({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof User;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="mb-4 flex items-center gap-2 border-b pb-3">
        <Icon className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function ProfileField({
  label,
  value,
  truncate,
}: {
  label: string;
  value: string;
  truncate?: boolean;
}) {
  if (!value) {
    return null;
  }
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className={`mt-0.5 text-sm ${truncate ? 'line-clamp-2' : ''}`}>{value}</p>
    </div>
  );
}

function ToneMeter({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <div className="relative mx-auto mb-1 size-11">
        <svg className="size-11 -rotate-90" viewBox="0 0 36 36">
          <path
            className="text-muted"
            strokeDasharray="100, 100"
            d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
          />
          <path
            className="text-primary"
            strokeDasharray={`${value * 10}, 100`}
            d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-xs font-bold tabular-nums">{value}</span>
      </div>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function TagList({
  label,
  tags,
  variant = 'neutral',
}: {
  label: string;
  tags: string[];
  variant?: 'neutral' | 'destructive';
}) {
  const tagClass = variant === 'destructive'
    ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400'
    : 'border bg-muted text-foreground';

  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="mt-1 flex flex-wrap gap-1">
        {tags.slice(0, 8).map(tag => (
          <span key={tag} className={`rounded border px-2 py-0.5 text-xs font-medium ${tagClass}`}>
            {tag}
          </span>
        ))}
        {tags.length > 8 && (
          <span className="text-xs text-muted-foreground">
            +
            {tags.length - 8}
            {' '}
            more
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================================
// CONTENT ANGLES SECTION
// ============================================================

const ANGLE_COLORS = ['#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#eab308'];

function parseAngleDesc(raw: string | null): { description: string; targetAudience: string } {
  if (!raw) return { description: '', targetAudience: '' };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object') {
      return {
        description: String(parsed.description ?? ''),
        targetAudience: String(parsed.targetAudience ?? ''),
      };
    }
  } catch { /* plain string — legacy */ }
  return { description: raw, targetAudience: '' };
}

type AngleFormState = {
  name: string;
  description: string;
  targetAudience: string;
  color: string;
};

function ContentAnglesSection() {
  const [angles, setAngles] = useState<ContentAngle[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(true);

  // null = no form open; 'new' = adding; string id = editing
  const [formTarget, setFormTarget] = useState<'new' | string | null>(null);
  const [form, setForm] = useState<AngleFormState>({ name: '', description: '', targetAudience: '', color: ANGLE_COLORS[0]! });
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fetchAngles = useCallback(async () => {
    try {
      const res = await fetch('/api/content-angles', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load angles');
      const data = (await res.json()) as { angles: ContentAngle[] };
      setAngles(data.angles ?? []);
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load angles');
    } finally {
      setIsFetching(false);
    }
  }, []);

  useEffect(() => { void fetchAngles(); }, [fetchAngles]);

  const openAdd = () => {
    setForm({ name: '', description: '', targetAudience: '', color: ANGLE_COLORS[0]! });
    setSaveError(null);
    setFormTarget('new');
  };

  const openEdit = (angle: ContentAngle) => {
    const parsed = parseAngleDesc(angle.description);
    setForm({ name: angle.name, description: parsed.description, targetAudience: parsed.targetAudience, color: angle.color ?? ANGLE_COLORS[0]! });
    setSaveError(null);
    setFormTarget(angle.id);
  };

  const closeForm = () => { setFormTarget(null); setSaveError(null); };

  const handleSave = async () => {
    if (!form.name.trim() || isSaving) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const isNew = formTarget === 'new';
      const url = isNew ? '/api/content-angles' : `/api/content-angles/${formTarget}`;
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, description: form.description, targetAudience: form.targetAudience, color: form.color }),
      });
      const data = (await res.json()) as { angle?: ContentAngle; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      if (data.angle) {
        if (isNew) {
          setAngles((prev) => [...prev, data.angle!]);
        } else {
          setAngles((prev) => prev.map((a) => (a.id === formTarget ? data.angle! : a)));
        }
      }
      closeForm();
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/content-angles/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Delete failed');
      }
      setAngles((prev) => prev.filter((a) => a.id !== id));
    } catch { /* silent — non-destructive, user sees the item stay */ }
  };

  return (
    <div className="mt-6 rounded-xl border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Content Angles</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Angles define the recurring perspectives and topics used across your campaign posts.
          </p>
        </div>
        {formTarget === null && (
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            <Plus className="size-3.5" />
            Add angle
          </button>
        )}
      </div>

      {/* Inline add / edit form */}
      {formTarget !== null && (
        <div className="border-b bg-muted/30 px-5 py-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {formTarget === 'new' ? 'New angle' : 'Edit angle'}
            </span>
            <button type="button" onClick={closeForm} className="rounded-md p-1 text-muted-foreground hover:bg-muted">
              <X className="size-4" />
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Educational tips"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="What kind of content goes under this angle?"
                rows={2}
                className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Target audience</label>
              <input
                type="text"
                value={form.targetAudience}
                onChange={(e) => setForm((f) => ({ ...f, targetAudience: e.target.value }))}
                placeholder="e.g. New business owners, 25-40"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-medium text-muted-foreground">Color</label>
              <div className="flex gap-2">
                {ANGLE_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, color: c }))}
                    className={`size-6 rounded-full border-2 transition-transform hover:scale-110 ${
                      form.color === c ? 'border-foreground scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            {saveError && <p className="text-xs text-destructive">{saveError}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={closeForm}
                className="rounded-xl border border-border px-4 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving || !form.name.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {isSaving && <Loader2 className="size-3 animate-spin" />}
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Angle list */}
      {isFetching ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : loadError ? (
        <p className="px-5 py-4 text-xs text-destructive">{loadError}</p>
      ) : angles.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-muted-foreground">
          No angles yet. Add one to get started.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {angles.map((angle) => {
            const parsed = parseAngleDesc(angle.description);
            const isEditing = formTarget === angle.id;
            return (
              <li key={angle.id} className={`flex items-start gap-3 px-5 py-3.5 ${isEditing ? 'bg-muted/20' : ''}`}>
                {/* Color swatch */}
                <div
                  className="mt-0.5 size-3 shrink-0 rounded-full"
                  style={{ backgroundColor: angle.color ?? '#ccc' }}
                />

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{angle.name}</span>
                    {angle.isSystem && (
                      <span className="rounded-full border border-muted bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        Default
                      </span>
                    )}
                  </div>
                  {parsed.description && (
                    <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{parsed.description}</p>
                  )}
                  {parsed.targetAudience && (
                    <p className="mt-0.5 text-[11px] text-muted-foreground/70">{parsed.targetAudience}</p>
                  )}
                </div>

                {/* Actions — only for org-owned angles */}
                {!angle.isSystem && (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(angle)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      title="Edit"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(angle.id)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      title="Delete"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
