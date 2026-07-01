
'use client';

import {
  AlertCircle,
  Check,
  ChevronDown,
  Image as ImageIcon,
  Info,
  Loader2,
  Plus,
  Type,
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import {
  FacebookIcon,
  InstagramIcon,
  LinkedInIcon,
  PinterestIcon,
  ThreadsIcon,
  TikTokIcon,
  TwitterIcon,
  YoutubeIcon,
  type PlatformInfo,
} from '@/components/icons/PlatformIcons';

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
// ALL PLATFORMS (flat list for the picker)
// ---------------------------------------------------------------------------
const ALL_PLATFORMS: PlatformEntry[] = [
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
];

// ---------------------------------------------------------------------------
// AVATAR
// ---------------------------------------------------------------------------
function Avatar({ src, username }: { src: string | null; username: string | null }) {
  const [failed, setFailed] = useState(false);

  const initials = username
    ? username.replace(/^@/, '').split(/[\s_.]/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
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
// PLATFORM TIP
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
      <TooltipContent side="left" align="center" className="max-w-[280px] p-0" sideOffset={8}>
        <div className="rounded-lg border bg-popover p-4 shadow-md">
          <p className="mb-2.5 text-xs font-semibold text-foreground">{tip.title}</p>
          <ul className="space-y-1.5 pl-3.5">
            {tip.items.map((item, i) => (
              <li key={i} className="list-disc text-[11px] leading-relaxed text-muted-foreground">{item}</li>
            ))}
          </ul>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// CONNECTED ACCOUNT ROW
// ---------------------------------------------------------------------------
function ConnectedRow({
  platform,
  account,
  onDisconnect,
  disconnecting,
}: {
  platform: PlatformEntry;
  account: SocialAccount;
  onDisconnect: (id: string) => void;
  disconnecting: string | null;
}) {
  const PIcon = platform.icon;

  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-4 sm:gap-4 sm:px-5">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted sm:size-10">
        <PIcon className="size-4 text-muted-foreground sm:size-5" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="text-sm font-medium">{platform.name}</p>
          {platform.badgeVariant === 'media' ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:border-sky-800 dark:bg-sky-900/30 dark:text-sky-400">
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
        <p className="mt-0.5 text-xs text-emerald-600">
          {account.platformUsername ? `@${account.platformUsername}` : 'Connected'}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2.5 sm:gap-3">
        <Avatar src={account.profileImageUrl} username={account.platformUsername} />

        <div className="hidden items-center gap-1.5 sm:flex">
          <div className="flex size-4 items-center justify-center rounded-full bg-emerald-500">
            <Check className="size-2.5 text-white" />
          </div>
          <span className="text-xs text-emerald-600">Connected</span>
        </div>

        <div className="flex size-5 items-center justify-center rounded-full bg-emerald-500 sm:hidden">
          <Check className="size-3 text-white" />
        </div>

        <PlatformTip tip={platform.tip} />

        <button
          type="button"
          onClick={() => onDisconnect(account.id)}
          disabled={disconnecting === account.id}
          className="rounded-lg border px-2.5 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50 sm:px-3"
        >
          {disconnecting === account.id ? <Loader2 className="size-3 animate-spin" /> : 'Disconnect'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PLATFORM PICKER ROW (inside expandable section)
// ---------------------------------------------------------------------------
function PlatformPickerRow({
  platform,
  onConnect,
}: {
  platform: PlatformEntry;
  onConnect: (entry: PlatformEntry) => void;
}) {
  const PIcon = platform.icon;
  const isMediaRow = platform.id === 'twitter_v1';

  return (
    <div className={`flex items-center gap-3 p-4 sm:gap-4 sm:px-5 ${isMediaRow ? 'bg-muted/30' : ''}`}>
      <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${isMediaRow ? 'bg-muted/50' : 'bg-muted'} sm:size-10`}>
        {isMediaRow ? (
          <ImageIcon className="size-4 text-muted-foreground sm:size-5" aria-hidden />
        ) : (
          <PIcon className="size-4 text-muted-foreground sm:size-5" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="text-sm font-medium">{platform.name}</p>
          {platform.badgeVariant === 'media' ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:border-sky-800 dark:bg-sky-900/30 dark:text-sky-400">
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
        <p className="mt-0.5 text-xs text-muted-foreground">
          {isMediaRow ? 'Connect to publish images & videos to X' : 'Not connected'}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <PlatformTip tip={platform.tip} />
        <button
          type="button"
          onClick={() => onConnect(platform)}
          className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors sm:px-4 sm:py-2 ${
            isMediaRow
              ? 'border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-900/30 dark:text-sky-400'
              : 'bg-foreground text-background hover:opacity-90'
          }`}
        >
          Connect
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MAIN CONTENT
// ---------------------------------------------------------------------------
function SocialAccountsContent() {
  const searchParams = useSearchParams();
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

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

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const connectPlatform = (entry: PlatformEntry) => {
    window.location.href = entry.connectHref
      ? entry.connectHref
      : `/api/social-accounts/connect?platform=${entry.id}`;
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

  const resolveAccount = (entry: PlatformEntry): SocialAccount | undefined => {
    if (entry.id === 'twitter_v1') return accounts.find(a => a.platform === 'twitter' && a.isActive && a.oauthToken);
    if (entry.id === 'twitter') return accounts.find(a => a.platform === 'twitter' && a.isActive && a.accessToken);
    return accounts.find(a => a.platform === entry.id && a.isActive);
  };

  const connectedPlatforms = ALL_PLATFORMS.filter(p => !!resolveAccount(p));
  const unconnectedPlatforms = ALL_PLATFORMS.filter(p => !resolveAccount(p));
  const connectedCount = accounts.filter(a => a.isActive).length;

  // Auto-open picker when no accounts are connected
  useEffect(() => {
    if (!isLoading && connectedCount === 0) setPickerOpen(true);
  }, [isLoading, connectedCount]);

  return (
    <TooltipProvider delayDuration={150}>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Social accounts</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {connectedCount > 0
            ? `${connectedCount} platform${connectedCount === 1 ? '' : 's'} connected.`
            : 'Connect your social accounts to publish and schedule content.'}
        </p>
      </div>

      {/* Banners */}
      {successPlatform && (
        <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400">
          <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500">
            <Check className="size-3 text-white" />
          </div>
          <span>
            <span className="font-medium capitalize">{successPlatform}</span>{' '}connected successfully.
          </span>
        </div>
      )}

      {errorType && (
        <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          Connection failed. Please try again.
        </div>
      )}

      {isLoading ? (
        <div className="flex min-h-[300px] items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Connected accounts */}
          {connectedPlatforms.length > 0 && (
            <div className="space-y-3">
              {connectedPlatforms.map(platform => {
                const account = resolveAccount(platform)!;
                return (
                  <ConnectedRow
                    key={`${platform.id}-connected`}
                    platform={platform}
                    account={account}
                    onDisconnect={disconnectAccount}
                    disconnecting={disconnecting}
                  />
                );
              })}
            </div>
          )}

          {/* Empty state — no connections */}
          {connectedPlatforms.length === 0 && (
            <div className="rounded-xl border border-dashed py-10 text-center">
              <p className="text-sm font-medium text-foreground">No channels connected</p>
              <p className="mt-1 text-xs text-muted-foreground">Add a channel below to start publishing</p>
            </div>
          )}

          {/* Connect more channels */}
          {unconnectedPlatforms.length > 0 && (
            <div className="rounded-xl border bg-card">
              <button
                type="button"
                onClick={() => setPickerOpen(prev => !prev)}
                className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-muted/30"
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex size-7 items-center justify-center rounded-full border bg-background">
                    <Plus className="size-3.5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Connect more channels</p>
                    <p className="text-xs text-muted-foreground">
                      {unconnectedPlatforms.length} platform{unconnectedPlatforms.length === 1 ? '' : 's'} available
                    </p>
                  </div>
                </div>
                <ChevronDown className={`size-4 text-muted-foreground transition-transform duration-150 ${pickerOpen ? 'rotate-180' : ''}`} />
              </button>

              {pickerOpen && (
                <div className="divide-y border-t">
                  {unconnectedPlatforms.map((platform, i) => (
                    <PlatformPickerRow
                      key={`${platform.id}-${i}`}
                      platform={platform}
                      onConnect={connectPlatform}
                    />
                  ))}
                  {unconnectedPlatforms.some(p => p.id === 'twitter_v1' || p.id === 'twitter') && (
                    <p className="px-5 py-3 text-xs text-muted-foreground">
                      X requires two separate connections: one for text posts (OAuth 2.0) and one for images &amp; video (OAuth 1.0a).
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <p className="mt-8 text-xs text-muted-foreground">
        NativPost uses official platform APIs with OAuth 2.0 and OAuth 1.0a where required.
        Credentials are encrypted and stored securely. Content is never published without your explicit approval.
      </p>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// PAGE
// ---------------------------------------------------------------------------
export default function SocialAccountsPage() {
  return (
    <Suspense fallback={<div className="flex min-h-[300px] items-center justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>}>
      <SocialAccountsContent />
    </Suspense>
  );
}
