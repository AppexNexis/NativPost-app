'use client';

import { AlertCircle, Check, Clock, Image, Loader2, Type } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';

import { type PlatformInfo, PLATFORMS } from '@/components/icons/PlatformIcons';

// -----------------------------------------------------------
// TYPES
// -----------------------------------------------------------
type SocialAccount = {
  id: string;
  platform: string;
  platformUsername: string | null;
  accountType: string | null;
  profileImageUrl: string | null;
  isActive: boolean;
  connectedAt: string;
  oauthToken?: string | null;
  accessToken?: string | null;
};

type PlatformEntry = (PlatformInfo | { id: string; name: string; description: string; icon: PlatformInfo['icon'] }) & {
  _connectHref?: string;
  _accountKey?: string;
  _badge?: string;
  _badgeVariant?: 'default' | 'highlight';
  _pending?: boolean;       // shows "coming soon" state — API approval in progress
  _pendingLabel?: string;   // e.g. "Awaiting Meta API approval"
};

// -----------------------------------------------------------
// Inline SVG icons for platforms not yet in PlatformIcons
// -----------------------------------------------------------
function WhatsAppIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.125.553 4.118 1.522 5.85L0 24l6.313-1.496A11.955 11.955 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.796 9.796 0 01-5.007-1.374l-.36-.213-3.727.883.944-3.623-.234-.372A9.796 9.796 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z" />
    </svg>
  );
}

function SnapchatIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.004 2c-1.3 0-4.243.37-5.823 3.455-.518 1.007-.394 2.694-.33 3.73l-.003.003c-.007.111-.014.222-.02.333-.106.12-.37.264-.818.264-.22 0-.47-.043-.734-.128l-.009-.003c-.047-.015-.098-.024-.155-.024-.285 0-.536.208-.536.494 0 .252.176.454.426.52.016.005 1.655.425 1.875 1.657.008.047.024.09.046.13.388.71 1.022 1.174 1.782 1.174.17 0 .34-.02.506-.059.534-.124 1.064-.074 1.518.14.618.292 1.03.914 1.01 1.558-.007.218-.035.424-.084.616-.16.634-.604 1.047-1.14 1.047-.065 0-.13-.007-.193-.022-.16-.037-.31-.06-.456-.06-.24 0-.465.056-.65.162C8.6 17.2 8.327 17.77 8.327 18.46c0 .095.007.187.022.278.13.776.99 1.165 2.137 1.358.08.356.19.796.23.937.063.22.245.363.47.363h.033c.12-.007.242-.043.367-.107.387-.197.834-.3 1.414-.3.58 0 1.027.1 1.414.3.126.064.247.1.367.107h.033c.225 0 .407-.143.47-.363.04-.14.15-.58.23-.937 1.147-.193 2.007-.582 2.137-1.358.015-.09.022-.183.022-.278 0-.69-.274-1.26-.69-1.587-.185-.106-.41-.162-.65-.162-.147 0-.296.023-.456.06-.063.015-.128.022-.193.022-.537 0-.98-.413-1.14-1.047-.05-.192-.077-.398-.084-.616-.02-.644.392-1.266 1.01-1.558.454-.214.984-.264 1.518-.14.166.039.337.059.506.059.76 0 1.394-.464 1.782-1.174.022-.04.038-.083.046-.13.22-1.232 1.86-1.652 1.875-1.657.25-.066.426-.268.426-.52 0-.286-.251-.494-.536-.494-.057 0-.108.009-.155.024l-.009.003c-.264.085-.514.128-.734.128-.448 0-.712-.145-.818-.264-.006-.111-.013-.222-.02-.333l-.003-.003c.064-1.036.188-2.723-.33-3.73C16.247 2.37 13.304 2 12.004 2z" />
    </svg>
  );
}

// -----------------------------------------------------------
// PLATFORM GROUPS
// -----------------------------------------------------------
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
        ...(twitterPlatform
          ? [{
            ...twitterPlatform,
            description: 'Text only',
            _badge: 'Text',
            _badgeVariant: 'default' as const,
          }]
          : []),
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
    {
      label: 'Messaging',
      platforms: [
        {
          id: 'whatsapp',
          name: 'WhatsApp',
          icon: WhatsAppIcon as PlatformInfo['icon'],
          color: '#25D366',
          description: 'Channel publishing',
          _pending: true,
          _pendingLabel: 'Meta Business API approval in progress',
        },
        {
          id: 'snapchat',
          name: 'Snapchat',
          icon: SnapchatIcon as PlatformInfo['icon'],
          color: '#FFFC00',
          description: 'Story publishing',
          _pending: true,
          _pendingLabel: 'Snap Marketing API approval in progress',
        },
      ],
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
                  const isPending = '_pending' in platform && platform._pending === true;

                  // Pending platforms (API approval in progress) — show differently
                  if (isPending) {
                    const PendingIcon = platform.icon;
                    return (
                      <div
                        key={`${platform.id}-${i}`}
                        className={`flex items-center gap-3 p-4 sm:gap-4 sm:px-5 ${!isLast ? 'border-b' : ''} bg-muted/20`}
                      >
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/60 sm:size-10">
                          <PendingIcon className="size-4 text-muted-foreground/60 sm:size-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="text-sm font-medium text-muted-foreground">{platform.name}</p>
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                              Coming soon
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground/70">
                            {'_pendingLabel' in platform ? platform._pendingLabel as string : 'API approval in progress'}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5 text-muted-foreground/50">
                          <Clock className="size-3.5" />
                          <span className="hidden text-xs sm:inline">Pending</span>
                        </div>
                      </div>
                    );
                  }

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