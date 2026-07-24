'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  Image as ImageIcon,
  Info,
  Loader2,
  Type,
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import {
  FacebookIcon,
  InstagramIcon,
  LinkedInIcon,
  PinterestIcon,
  type PlatformInfo,
  ThreadsIcon,
  TikTokIcon,
  TwitterIcon,
  YoutubeIcon,
} from '@/components/icons/PlatformIcons';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ErrorBanner } from '@/features/dashboard/ErrorBanner';
import { LoadingState } from '@/features/dashboard/LoadingState';
import { ManagedAccountsSection } from '@/features/dashboard/ManagedAccountsSection';
import { ListPageSkeleton } from '@/features/dashboard/PageSkeletons';

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------
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

type PlatformEntry = {
  id: string;
  name: string;
  icon: PlatformInfo['icon'];
  color: string;
  description?: string;
  badge?: string;
  badgeVariant?: 'text' | 'media';
  connectHref?: string;
  tip: {
    title: string;
    items: string[];
  };
};

// ---------------------------------------------------------------------------
// PLATFORM GROUPS WITH TIPS
// ---------------------------------------------------------------------------
const PLATFORM_GROUPS: { label: string; platforms: PlatformEntry[] }[] = [
  {
    label: 'Meta',
    platforms: [
      {
        id: 'instagram',
        name: 'Instagram',
        icon: InstagramIcon,
        color: '#E4405F',
        tip: {
          title: 'Before connecting Instagram',
          items: [
            'Your account must be a Business or Creator account. Personal accounts are not supported by Meta\'s API since December 2024.',
            'Your Instagram must be linked to a Facebook Page you admin. Go to Instagram Settings → Account → Linked accounts.',
            'Log into Instagram in this browser before connecting.',
          ],
        },
      },
      {
        id: 'facebook',
        name: 'Facebook',
        icon: FacebookIcon,
        color: '#1877F2',
        tip: {
          title: 'Before connecting Facebook',
          items: [
            'Connect a Facebook Page, not a personal profile. Page admin access is required.',
            'Log into the Facebook account that owns or manages the Page in this browser.',
            'Your app role must include Content Creator or higher in Page settings.',
          ],
        },
      },
    ],
  },
  {
    label: 'Professional',
    platforms: [
      {
        id: 'linkedin',
        name: 'LinkedIn',
        icon: LinkedInIcon,
        color: '#0A66C2',
        description: 'Personal profile',
        tip: {
          title: 'Before connecting LinkedIn',
          items: [
            'Log into the LinkedIn account you want to publish from in this browser.',
            'LinkedIn tokens expire after 60 days. You will be prompted to reconnect before expiry.',
            'Avoid connecting the same account to multiple scheduling apps — LinkedIn rate-limits per member.',
          ],
        },
      },
      {
        id: 'linkedin_page',
        name: 'LinkedIn Page',
        icon: LinkedInIcon,
        color: '#0A66C2',
        description: 'Company page',
        tip: {
          title: 'Before connecting a LinkedIn Page',
          items: [
            'You must be a Super Admin of the LinkedIn Company Page.',
            'Log in as the account with Super Admin access before clicking Connect.',
            'Company Pages require a separate connection from personal profiles even if it\'s the same LinkedIn account.',
          ],
        },
      },
    ],
  },
  {
    label: 'Social',
    platforms: [
      {
        id: 'twitter',
        name: 'X',
        icon: TwitterIcon,
        color: '#000000',
        badge: 'Text',
        badgeVariant: 'text',
        tip: {
          title: 'X — text connection (OAuth 2.0)',
          items: [
            'This connection handles text-only posts via OAuth 2.0.',
            'Log into X in this browser before connecting.',
            'As of February 2026, X charges per API request for URL-containing posts. NativPost absorbs this cost.',
          ],
        },
      },
      {
        id: 'twitter_v1',
        name: 'X',
        icon: TwitterIcon,
        color: '#000000',
        badge: 'Images & video',
        badgeVariant: 'media',
        connectHref: '/api/social-accounts/connect/twitter-v1',
        tip: {
          title: 'X — media connection (OAuth 1.0a)',
          items: [
            'X requires two separate connections to publish all content types. This one unlocks images and video via OAuth 1.0a.',
            'Both connections must use the same X account.',
            'Use the same browser session as your text connection above.',
          ],
        },
      },
      {
        id: 'tiktok',
        name: 'TikTok',
        icon: TikTokIcon,
        color: '#000000',
        tip: {
          title: 'Before connecting TikTok',
          items: [
            'Log into TikTok in this browser before clicking Connect.',
            'Your account must allow third-party app access. Check TikTok Settings → Privacy → Manage app permissions.',
            'TikTok tokens expire roughly every 30 days. Reconnect when prompted.',
          ],
        },
      },
    ],
  },
  {
    label: 'Video and visual',
    platforms: [
      {
        id: 'youtube',
        name: 'YouTube',
        icon: YoutubeIcon,
        color: '#FF0000',
        description: 'Video only',
        tip: {
          title: 'Before connecting YouTube',
          items: [
            'Log into the Google account that owns your YouTube channel in this browser.',
            'If you manage multiple channels, make sure the correct channel is active at youtube.com first.',
            'YouTube\'s API quota is 10,000 units per day. Each video upload costs 1,600 units.',
          ],
        },
      },
      {
        id: 'pinterest',
        name: 'Pinterest',
        icon: PinterestIcon,
        color: '#E60023',
        tip: {
          title: 'Before connecting Pinterest',
          items: [
            'Log into Pinterest in this browser before clicking Connect.',
            'A Pinterest Business account unlocks analytics and richer publishing capabilities.',
            'Pins published via API are public by default. Secret board publishing requires specific permissions.',
          ],
        },
      },
    ],
  },
  {
    label: 'Threads',
    platforms: [
      {
        id: 'threads',
        name: 'Threads',
        icon: ThreadsIcon,
        color: '#000000',
        tip: {
          title: 'Before connecting Threads',
          items: [
            'Threads connects through your Instagram Business or Creator account. Connect Instagram first.',
            'Your Instagram account must have Threads enabled and active.',
            'Log into Threads in this browser before connecting.',
          ],
        },
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// AVATAR — profile image with initials fallback
// ---------------------------------------------------------------------------
function Avatar({
  src,
  username,
}: {
  src: string | null;
  username: string | null;
}) {
  const [failed, setFailed] = useState(false);

  const initials = username
    ? username
        .replace(/^@/, '')
        .split(/[\s_.]/)
        .filter(Boolean)
        .slice(0, 2)
        .map(w => w[0]?.toUpperCase() ?? '')
        .join('')
    : '?';

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={username ?? 'profile'}
        onError={() => setFailed(true)}
        className="size-7 shrink-0 rounded-full object-cover ring-1 ring-border"
      />
    );
  }

  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary ring-1 ring-border">
      {initials}
    </span>
  );
}

// ---------------------------------------------------------------------------
// PLATFORM TIP — Radix tooltip, renders in a portal so it never gets clipped
// ---------------------------------------------------------------------------
function PlatformTip({ tip }: { tip: PlatformEntry['tip'] }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="flex size-6 shrink-0 items-center justify-center rounded-full border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Setup requirements"
        >
          <Info className="size-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="left"
        align="center"
        className="max-w-[280px] p-0"
        sideOffset={8}
      >
        <div className="rounded-lg border bg-popover p-4 shadow-md">
          <p className="mb-2.5 text-xs font-semibold text-foreground">{tip.title}</p>
          <ul className="space-y-1.5 pl-3.5">
            {tip.items.map((item, i) => (
              <li
                key={i}
                className="list-disc text-micro leading-relaxed text-muted-foreground"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// MAIN CONTENT
// ---------------------------------------------------------------------------
function SocialAccountsContent() {
  const searchParams = useSearchParams();
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  const successPlatform = searchParams.get('success');
  const errorType = searchParams.get('error');

  // Connected accounts through the query cache — instant back-nav.
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['social-accounts'],
    queryFn: async (): Promise<SocialAccount[]> => {
      const res = await fetch('/api/social-accounts');
      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }
      const body = await res.json();
      return body.accounts || [];
    },
  });
  const accounts = data ?? [];

  const connectPlatform = (entry: PlatformEntry) => {
    window.location.href = entry.connectHref
      ? entry.connectHref
      : `/api/social-accounts/connect?platform=${entry.id}`;
  };

  const disconnectAccount = async (accountId: string) => {
    // eslint-disable-next-line no-alert
    if (!confirm('Disconnect this account? You can reconnect at any time.')) {
      return;
    }
    setDisconnecting(accountId);
    try {
      await fetch(`/api/social-accounts?id=${accountId}`, { method: 'DELETE' });
      queryClient.setQueryData<SocialAccount[]>(['social-accounts'], old => old?.filter(a => a.id !== accountId));
    } finally {
      setDisconnecting(null);
    }
  };

  const resolveAccount = (entry: PlatformEntry): SocialAccount | undefined => {
    if (entry.id === 'twitter_v1') {
      return accounts.find(a => a.platform === 'twitter' && a.isActive && a.oauthToken);
    }
    if (entry.id === 'twitter') {
      return accounts.find(a => a.platform === 'twitter' && a.isActive && a.accessToken);
    }
    return accounts.find(a => a.platform === entry.id && a.isActive);
  };

  const connectedCount = accounts.filter(a => a.isActive).length;

  return (
    <TooltipProvider delayDuration={150}>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Social accounts</h1>
        <p className="mt-0.5 text-body text-muted-foreground">
          {connectedCount > 0
            ? `${connectedCount} platform${connectedCount === 1 ? '' : 's'} connected. Connect more to expand your publishing reach.`
            : 'Connect your social accounts to publish and schedule content.'}
        </p>
      </div>

      {/* Banners */}
      {successPlatform && (
        <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500">
            <Check className="size-3 text-white" />
          </div>
          <span>
            <span className="font-medium capitalize">{successPlatform}</span>
            {' '}
            connected successfully.
          </span>
        </div>
      )}

      {errorType && (
        <div className="mb-5">
          <ErrorBanner
            title="Connection failed"
            detail="The OAuth flow did not complete. Please try connecting again."
          />
        </div>
      )}

      {isLoading ? (
        <ListPageSkeleton rows={6} />
      ) : (
        <div className="space-y-8">
          {PLATFORM_GROUPS.map(group => (
            <div key={group.label}>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </p>

              {/* overflow-visible so portal tooltips still work, border via children */}
              <div className="rounded-xl border bg-card">
                {group.platforms.map((platform, i) => {
                  const PIcon = platform.icon;
                  const account = resolveAccount(platform);
                  const connected = !!account;
                  const isLast = i === group.platforms.length - 1;
                  const isMediaRow = platform.id === 'twitter_v1';

                  return (
                    <div
                      key={`${platform.id}-${i}`}
                      className={[
                        'flex items-center gap-3 p-4 sm:gap-4 sm:px-5',
                        !isLast ? 'border-b' : '',
                        isMediaRow && !connected ? 'bg-muted/30' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {/* Platform icon */}
                      <div
                        className={[
                          'flex size-9 shrink-0 items-center justify-center rounded-lg sm:size-10',
                          isMediaRow ? 'bg-muted/50' : 'bg-muted',
                        ].join(' ')}
                      >
                        {isMediaRow ? (
                          <ImageIcon
                            className="size-4 text-muted-foreground sm:size-5"
                            aria-hidden
                          />
                        ) : (
                          <PIcon className="size-4 text-muted-foreground sm:size-5" />
                        )}
                      </div>

                      {/* Name + status */}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="text-sm font-medium">{platform.name}</p>

                          {platform.badgeVariant === 'media' ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">
                              <ImageIcon className="size-2.5" aria-hidden />
                              Images &amp; video
                            </span>
                          ) : platform.badge ? (
                            <span className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                              <Type className="size-2.5" aria-hidden />
                              {platform.badge}
                            </span>
                          ) : platform.description ? (
                            <span className="rounded-full border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                              {platform.description}
                            </span>
                          ) : null}
                        </div>

                        {connected ? (
                          <p className="mt-0.5 text-xs text-emerald-600">
                            {account.platformUsername
                              ? `@${account.platformUsername}`
                              : 'Connected'}
                          </p>
                        ) : isMediaRow ? (
                          <p className="mt-0.5 text-meta text-muted-foreground">
                            Connect to publish images &amp; videos to X
                          </p>
                        ) : (
                          <p className="mt-0.5 text-meta text-muted-foreground">
                            Not connected
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      {connected ? (
                        <div className="flex shrink-0 items-center gap-2.5 sm:gap-3">
                          {/* Profile picture */}
                          <Avatar
                            src={account.profileImageUrl}
                            username={account.platformUsername}
                          />

                          {/* Connected indicator — desktop */}
                          <div className="hidden items-center gap-1.5 sm:flex">
                            <div className="flex size-4 items-center justify-center rounded-full bg-emerald-500">
                              <Check className="size-2.5 text-white" />
                            </div>
                            <span className="text-xs text-emerald-600">Connected</span>
                          </div>

                          {/* Connected dot — mobile */}
                          <div className="flex size-5 items-center justify-center rounded-full bg-emerald-500 sm:hidden">
                            <Check className="size-3 text-white" />
                          </div>

                          <PlatformTip tip={platform.tip} />

                          <button
                            type="button"
                            onClick={() => disconnectAccount(account.id)}
                            disabled={disconnecting === account.id}
                            className="rounded-lg border px-2.5 py-1.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-50 disabled:opacity-50 sm:px-3"
                          >
                            {disconnecting === account.id ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : (
                              'Disconnect'
                            )}
                          </button>
                        </div>
                      ) : (
                        <div className="flex shrink-0 items-center gap-2">
                          <PlatformTip tip={platform.tip} />

                          <button
                            type="button"
                            onClick={() => connectPlatform(platform)}
                            className={[
                              'shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors sm:px-4 sm:py-2',
                              isMediaRow
                                ? 'border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100'
                                : 'bg-foreground text-background hover:opacity-90',
                            ].join(' ')}
                          >
                            Connect
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {group.label === 'Social' && (
                <p className="mt-2 text-meta text-muted-foreground">
                  X requires two separate connections: one for text posts (OAuth 2.0) and one
                  for images &amp; video (OAuth 1.0a). Connect both for full publishing support.
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <ManagedAccountsSection />

      <p className="mt-8 text-meta text-muted-foreground">
        NativPost uses official platform APIs with OAuth 2.0 and OAuth 1.0a where required.
        Credentials are encrypted and stored securely. Content is never published without your
        explicit approval.
      </p>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// PAGE
// ---------------------------------------------------------------------------
export default function SocialAccountsPage() {
  return (
    <Suspense fallback={<LoadingState message="Loading connected accounts" minHeightClass="min-h-[300px]" />}>
      <SocialAccountsContent />
    </Suspense>
  );
}
