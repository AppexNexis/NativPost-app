'use client';

import {
  ExternalLink,
  Globe,
  Loader2,
  MessageSquare,
  Palette,
  Pencil,
  Play,
  Sparkles,
  User,
} from 'lucide-react';
import Image from 'next/image';
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
          description="NativPost uses your Brand Profile to generate content that matches your voice, style, and strategy."
        />
        {/* Video tutorial placeholder */}
        <SetupCallBanner />
        <EmptyState
          icon={Palette}
          title="No Brand Profile configured"
          description="Complete your Brand Profile so NativPost can generate content that sounds and looks like your brand."
          actionLabel="Configure Brand Profile"
          actionHref="/dashboard/brand-profile/onboarding"
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
                  // TODO: Remove 32v3ws8ss0 workaround and switch back to original URL once Uploadcare fixes their CORS headers
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
