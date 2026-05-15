'use client';

import { AlertCircle, Check, Image, Loader2, Type } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';

import { type PlatformInfo, PLATFORMS } from '@/components/icons/PlatformIcons';

// -----------------------------------------------------------
// TYPES
// -----------------------------------------------------------
// 1. Add to the type at the top
type SocialAccount = {
  id: string;
  platform: string;
  platformUsername: string | null;
  accountType: string | null;
  profileImageUrl: string | null;
  isActive: boolean;
  connectedAt: string;
  oauthToken?: string | null;
  accessToken?: string | null; // ← add this
};

// A "virtual" platform entry for the X media (OAuth 1.0a) row
type PlatformEntry = (PlatformInfo | { id: string; name: string; description: string; icon: PlatformInfo['icon'] }) & {
  _connectHref?: string; // custom connect URL
  _accountKey?: string;  // which platform key to look up in accounts
  _badge?: string;
  _badgeVariant?: 'default' | 'highlight';
};

// -----------------------------------------------------------
// PLATFORM GROUPS
// -----------------------------------------------------------

// We split Twitter into two rows: text-only (OAuth 2) and media (OAuth 1.0a)
// The media row uses platform id "twitter_v1" but resolves to the same "twitter"
// account record — we check oauthToken presence to show it as connected.

function buildGroups(platforms: PlatformInfo[]): { label: string; platforms: PlatformEntry[] }[] {
  const twitterPlatform = platforms.find(p => p.id === 'twitter');

  return [
    {
      label: 'Meta',
      platforms: platforms.filter(p => ['instagram', 'facebook', 'threads'].includes(p.id)),
    },
    {
      label: 'Professional',
      platforms: platforms.filter(p => ['linkedin', 'linkedin_page'].includes(p.id)),
    },
    {
      label: 'Social',
      platforms: [
        // Text-only row (OAuth 2.0)
        ...(twitterPlatform
          ? [{
            ...twitterPlatform,
            description: 'Text only',
            _badge: 'Text',
            _badgeVariant: 'default' as const,
          }]
          : []),
        // Media row (OAuth 1.0a)
        ...(twitterPlatform
          ? [{
            ...twitterPlatform,
            id: 'twitter_v1',
            name: 'X',
            description: 'Images & video',
            _connectHref: '/api/social-accounts/connect/twitter-v1',
            _accountKey: 'twitter_v1_media',
            _badge: 'Media',
            _badgeVariant: 'highlight' as const,
          }]
          : []),
        ...platforms.filter(p => p.id === 'tiktok'),
      ],
    },
    {
      label: 'Video and visual',
      platforms: platforms.filter(p => ['youtube', 'pinterest'].includes(p.id)),
    },
  ];
}

// -----------------------------------------------------------
// CONNECTIONS CONTENT
// -----------------------------------------------------------
function ConnectionsContent() {
  const searchParams = useSearchParams();
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  const successPlatform = searchParams.get('success');
  const errorType = searchParams.get('error');

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/social-accounts');
      if (res.ok) {
        const data = await res.json();
        setAccounts(data.accounts || []);
      }
    } catch (err) {
      console.error('Failed to fetch accounts:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const connectPlatform = (entry: PlatformEntry) => {
    if (entry._connectHref) {
      window.location.href = entry._connectHref;
      return;
    }
    window.location.href = `/api/social-accounts/connect?platform=${entry.id}`;
  };

  const disconnectAccount = async (accountId: string) => {
    // eslint-disable-next-line no-alert
    if (!confirm('Disconnect this account? You can reconnect at any time.')) return;
    setDisconnecting(accountId);
    try {
      await fetch(`/api/social-accounts?id=${accountId}`, { method: 'DELETE' });
      setAccounts(prev => prev.filter(a => a.id !== accountId));
    } finally {
      setDisconnecting(null);
    }
  };

  // For regular platforms: find by platform id + isActive
  const getAccount = (platformId: string) => {
    const acc = accounts.find(a => a.platform === platformId && a.isActive);
    if (!acc) return undefined;
    if (platformId === 'twitter') return acc.accessToken ? acc : undefined; // ← needs OAuth 2.0
    return acc;
  };

  // For the twitter_v1 (media) row: same twitter account but must have oauthToken
  const getTwitterMediaAccount = () => {
    const acc = accounts.find(a => a.platform === 'twitter' && a.isActive);
    return acc?.oauthToken ? acc : undefined; // ← needs OAuth 1.0a
  };

  const resolveAccount = (entry: PlatformEntry) => {
    if (entry.id === 'twitter_v1') return getTwitterMediaAccount();
    return getAccount(entry.id);
  };

  const successLabel = successPlatform
    ? (PLATFORMS.find(p => p.id === successPlatform)?.name ?? successPlatform)
    : null;

  const connectedCount = accounts.filter(a => a.isActive).length;
  const PLATFORM_GROUPS = buildGroups(PLATFORMS);

  return (
    <>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Connections</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {connectedCount > 0
            ? `${connectedCount} platform${connectedCount === 1 ? '' : 's'} connected. Connect more to expand your publishing reach.`
            : 'Connect your social accounts to publish and schedule content.'}
        </p>
      </div>

      {/* Toast notifications */}
      {successLabel && (
        <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500">
            <Check className="size-3 text-white" />
          </div>
          <span>
            <span className="font-medium">{successLabel}</span>
            {' '}
            connected successfully.
          </span>
        </div>
      )}

      {errorType && (
        <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="size-4 shrink-0" />
          Connection failed. Please try again.
        </div>
      )}

      {isLoading ? (
        <div className="flex min-h-[300px] items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-8">
          {PLATFORM_GROUPS.map(group => (
            <div key={group.label}>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </p>

              <div className="overflow-hidden rounded-xl border bg-card">
                {group.platforms.map((platform, i) => {
                  const PIcon = platform.icon;
                  const account = resolveAccount(platform);
                  const connected = !!account;
                  const isLast = i === group.platforms.length - 1;
                  const isTwitterMediaRow = platform.id === 'twitter_v1';

                  return (
                    <div
                      key={`${platform.id}-${i}`}
                      className={`flex items-center gap-3 p-4 sm:gap-4 sm:px-5 ${!isLast ? 'border-b' : ''} ${isTwitterMediaRow && !connected ? 'bg-muted/30' : ''}`}
                    >
                      {/* Platform icon — indented for sub-rows */}
                      <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg sm:size-10 ${isTwitterMediaRow ? 'bg-muted/50' : 'bg-muted'}`}>
                        {isTwitterMediaRow
                          ? <Image className="size-4 text-muted-foreground sm:size-5" aria-hidden />
                          : <PIcon className="size-4 text-muted-foreground sm:size-5" />}
                      </div>

                      {/* Name, badge, status */}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="text-sm font-medium">{platform.name}</p>

                          {/* Capability badge */}
                          {platform._badgeVariant === 'highlight' ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">
                              <Image className="size-2.5" aria-hidden />
                              Images &amp; video
                            </span>
                          ) : platform._badge ? (
                            <span className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                              <Type className="size-2.5" aria-hidden />
                              {platform._badge}
                            </span>
                          ) : platform.description ? (
                            <span className="rounded-full border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                              {platform.description}
                            </span>
                          ) : null}
                        </div>

                        {connected ? (
                          <p className="mt-0.5 text-xs text-emerald-600">
                            {account.platformUsername ? `@${account.platformUsername}` : 'Connected'}
                          </p>
                        ) : isTwitterMediaRow ? (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Connect to publish images &amp; videos to X
                          </p>
                        ) : (
                          <p className="mt-0.5 text-xs text-muted-foreground">Not connected</p>
                        )}
                      </div>

                      {/* Actions */}
                      {connected ? (
                        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                          <div className="hidden items-center gap-1.5 sm:flex">
                            <div className="flex size-4 items-center justify-center rounded-full bg-emerald-500">
                              <Check className="size-2.5 text-white" />
                            </div>
                            <span className="text-xs text-emerald-600">Connected</span>
                          </div>
                          <div className="flex size-5 items-center justify-center rounded-full bg-emerald-500 sm:hidden">
                            <Check className="size-3 text-white" />
                          </div>
                          <button
                            type="button"
                            onClick={() => disconnectAccount(account.id)}
                            disabled={disconnecting === account.id}
                            className="rounded-lg border px-2.5 py-1.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-50 disabled:opacity-50 sm:px-3"
                          >
                            {disconnecting === account.id
                              ? <Loader2 className="size-3 animate-spin" />
                              : 'Disconnect'}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => connectPlatform(platform)}
                          className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors sm:px-4 sm:py-2 ${isTwitterMediaRow
                            ? 'border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100'
                            : 'bg-foreground text-background hover:opacity-90'
                            }`}
                        >
                          Connect
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Contextual hint under the Social group explaining the two X rows */}
              {group.label === 'Social' && (
                <p className="mt-2 text-xs text-muted-foreground">
                  X requires two separate connections: one for text posts (OAuth 2.0) and one for images &amp; video (OAuth 1.0a). Connect both for full publishing support.
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Security note */}
      <p className="mt-8 text-xs text-muted-foreground">
        NativPost uses official platform APIs with OAuth 2.0 and OAuth 1.0a where required. Credentials are encrypted and stored securely.
        Content is never published without your explicit approval.
      </p>
    </>
  );
}

// -----------------------------------------------------------
// PAGE
// -----------------------------------------------------------
export default function ConnectionsPage() {
  return (
    <Suspense
      fallback={(
        <div className="flex min-h-[300px] items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}
    >
      <ConnectionsContent />
    </Suspense>
  );
}