'use client';

import {
  Globe,
  Loader2,
  MessageSquare,
  Palette,
  Pencil,
  Sparkles,
  User,
} from 'lucide-react';
import Link from 'next/link';

import { useBrandProfile } from '@/features/brand-profile/useBrandProfile';
import { EmptyState } from '@/features/dashboard/EmptyState';
import { PageHeader } from '@/features/dashboard/PageHeader';

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
          description="Your brand's creative DNA — voice, visuals, and content strategy."
        />
        <EmptyState
          icon={Palette}
          title="No Brand Profile yet"
          description="Your Brand Profile teaches NativPost how to create content that sounds and looks like your brand."
          actionLabel="Build your Brand Profile"
          actionHref="/dashboard/brand-profile/onboarding"
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Brand Profile"
        description="Your brand's creative DNA — voice, visuals, and content strategy."
        actions={
          <Link
            href="/dashboard/brand-profile/onboarding"
            className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            <Pencil className="size-4" />
            Edit profile
          </Link>
        }
      />

      {/* Completeness bar */}
      <div className="mb-6 rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Profile completeness</span>
          <span className="font-semibold text-[#16A34A]">{profileCompleteness}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-[#16A34A] transition-all duration-500"
            style={{ width: `${profileCompleteness}%` }}
          />
        </div>
        {profileCompleteness < 80 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Complete more fields to improve content quality.{' '}
            <Link href="/dashboard/brand-profile/onboarding" className="text-[#16A34A] underline">
              Continue editing
            </Link>
          </p>
        )}
      </div>

      {/* Profile cards grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Business basics */}
        <ProfileCard icon={User} title="Business basics">
          <ProfileField label="Brand name" value={data.brandName} />
          <ProfileField label="Industry" value={data.industry} />
          <ProfileField label="Target audience" value={data.targetAudience} />
          <ProfileField label="Website" value={data.websiteUrl} />
          {data.companyDescription && (
            <ProfileField label="Description" value={data.companyDescription} truncate />
          )}
        </ProfileCard>

        {/* Voice & personality */}
        <ProfileCard icon={MessageSquare} title="Voice & personality">
          <div className="grid grid-cols-3 gap-3">
            <ToneMeter label="Formality" value={data.toneFormality} />
            <ToneMeter label="Humor" value={data.toneHumor} />
            <ToneMeter label="Energy" value={data.toneEnergy} />
          </div>
          {data.communicationStyle && (
            <ProfileField label="Style" value={data.communicationStyle} truncate />
          )}
          {data.vocabulary.length > 0 && (
            <TagList label="Preferred words" tags={data.vocabulary} color="green" />
          )}
          {data.forbiddenWords.length > 0 && (
            <TagList label="Forbidden words" tags={data.forbiddenWords} color="red" />
          )}
        </ProfileCard>

        {/* Visual identity */}
        <ProfileCard icon={Palette} title="Visual identity">
          <div>
            <span className="text-xs text-muted-foreground">Brand colors</span>
            <div className="mt-1 flex items-center gap-2">
              {[data.primaryColor, data.secondaryColor, data.accentColor].filter(Boolean).map((c, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <div className="size-7 rounded-lg border" style={{ backgroundColor: c }} />
                  <span className="font-mono text-xs text-muted-foreground">{c}</span>
                </div>
              ))}
            </div>
          </div>
          <ProfileField label="Image style" value={data.imageStyle} />
          <ProfileField label="Font preference" value={data.fontPreference} />
        </ProfileCard>

        {/* Content preferences */}
        <ProfileCard icon={Sparkles} title="Content preferences">
          {data.contentExamples.length > 0 && (
            <TagList label="Content you admire" tags={data.contentExamples} />
          )}
          {data.antiPatterns.length > 0 && (
            <TagList label="Anti-patterns" tags={data.antiPatterns} color="red" />
          )}
          {data.hashtagStrategy && (
            <ProfileField label="Hashtag strategy" value={data.hashtagStrategy} truncate />
          )}
        </ProfileCard>

        {/* Platform voices — full width */}
        <div className="sm:col-span-2">
          <ProfileCard icon={Globe} title="Platform voices">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { label: 'LinkedIn', value: data.linkedinVoice },
                { label: 'Instagram', value: data.instagramVoice },
                { label: 'X / Twitter', value: data.twitterVoice },
                { label: 'Facebook', value: data.facebookVoice },
                { label: 'TikTok', value: data.tiktokVoice },
              ]
                .filter((p) => p.value)
                .map((p) => (
                  <div key={p.label} className="rounded-lg bg-muted/50 p-3">
                    <span className="text-xs font-semibold">{p.label}</span>
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-3">{p.value}</p>
                  </div>
                ))}
              {![data.linkedinVoice, data.instagramVoice, data.twitterVoice, data.facebookVoice, data.tiktokVoice].some(Boolean) && (
                <p className="text-sm text-muted-foreground">No platform-specific voices configured yet.</p>
              )}
            </div>
          </ProfileCard>
        </div>
      </div>
    </>
  );
}

// ============================================================
// SUB-COMPONENTS
// ============================================================

function ProfileCard({ icon: Icon, title, children }: { icon: typeof User; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function ProfileField({ label, value, truncate }: { label: string; value: string; truncate?: boolean }) {
  if (!value) return null;
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className={`text-sm ${truncate ? 'line-clamp-2' : ''}`}>{value}</p>
    </div>
  );
}

function ToneMeter({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <div className="relative mx-auto mb-1 size-12">
        <svg className="size-12 -rotate-90" viewBox="0 0 36 36">
          <path className="text-muted" strokeDasharray="100, 100" d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" />
          <path className="text-[#16A34A]" strokeDasharray={`${value * 10}, 100`} d="M18 2.0845a 15.9155 15.9155 0 0 1 0 31.831a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">{value}</span>
      </div>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function TagList({ label, tags, color }: { label: string; tags: string[]; color?: 'green' | 'red' }) {
  const colorClass = color === 'red' ? 'bg-red-50 text-red-700' : color === 'green' ? 'bg-green-50 text-green-700' : 'bg-muted';
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="mt-1 flex flex-wrap gap-1">
        {tags.slice(0, 8).map((tag) => (
          <span key={tag} className={`rounded-md px-2 py-0.5 text-xs font-medium ${colorClass}`}>{tag}</span>
        ))}
        {tags.length > 8 && <span className="text-xs text-muted-foreground">+{tags.length - 8} more</span>}
      </div>
    </div>
  );
}
