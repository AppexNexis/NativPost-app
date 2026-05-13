'use client';

import { AlertCircle, Check, Loader2 } from 'lucide-react';
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
};

// -----------------------------------------------------------
// PLATFORM GROUPS
// -----------------------------------------------------------
const PLATFORM_GROUPS: { label: string; platforms: PlatformInfo[] }[] = [
  {
    label: 'Meta',
    platforms: PLATFORMS.filter(p => ['instagram', 'facebook', 'threads'].includes(p.id)),
  },
  {
    label: 'Professional',
    platforms: PLATFORMS.filter(p => ['linkedin', 'linkedin_page'].includes(p.id)),
  },
  {
    label: 'Social',
    platforms: PLATFORMS.filter(p => ['twitter', 'tiktok'].includes(p.id)),
  },
  {
    label: 'Video and visual',
    platforms: PLATFORMS.filter(p => ['youtube', 'pinterest'].includes(p.id)),
  },
];

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

  const connectPlatform = (platformId: string) => {
    window.location.href = `/api/social-accounts/connect?platform=${platformId}`;
  };

  const disconnectAccount = async (accountId: string) => {
    // eslint-disable-next-line no-alert
    if (!confirm('Disconnect this account? You can reconnect at any time.')) {
      return;
    }
    setDisconnecting(accountId);
    try {
      await fetch(`/api/social-accounts?id=${accountId}`, { method: 'DELETE' });
      setAccounts(prev => prev.filter(a => a.id !== accountId));
    } finally {
      setDisconnecting(null);
    }
  };

  const getAccount = (platformId: string) =>
    accounts.find(a => a.platform === platformId && a.isActive);

  const successLabel = successPlatform
    ? PLATFORMS.find(p => p.id === successPlatform)?.name ?? successPlatform
    : null;

  const connectedCount = accounts.filter(a => a.isActive).length;

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
              {/* Group label */}
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </p>

              <div className="overflow-hidden rounded-xl border bg-card">
                {group.platforms.map((platform, i) => {
                  const PIcon = platform.icon;
                  const account = getAccount(platform.id);
                  const connected = !!account;
                  const isLast = i === group.platforms.length - 1;

                  return (
                    <div
                      key={platform.id}
                      className={`flex items-center gap-3 p-4 sm:gap-4 sm:px-5 ${!isLast ? 'border-b' : ''}`}
                    >
                      {/* Platform icon */}
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted sm:size-10">
                        <PIcon className="size-4 text-muted-foreground sm:size-5" />
                      </div>

                      {/* Name, description, status */}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="text-sm font-medium">{platform.name}</p>
                          {platform.description && (
                            <span className="rounded-full border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                              {platform.description}
                            </span>
                          )}
                        </div>
                        {connected ? (
                          <p className="mt-0.5 text-xs text-emerald-600">
                            {account.platformUsername ? `@${account.platformUsername}` : 'Connected'}
                          </p>
                        ) : (
                          <p className="mt-0.5 text-xs text-muted-foreground">Not connected</p>
                        )}
                      </div>

                      {/* Actions */}
                      {connected ? (
                        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                          {/* Connected indicator */}
                          <div className="hidden items-center gap-1.5 sm:flex">
                            <div className="flex size-4 items-center justify-center rounded-full bg-emerald-500">
                              <Check className="size-2.5 text-white" />
                            </div>
                            <span className="text-xs text-emerald-600">Connected</span>
                          </div>
                          {/* Mobile: just the checkmark */}
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
                          onClick={() => connectPlatform(platform.id)}
                          className="shrink-0 rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-colors hover:opacity-90 sm:px-4 sm:py-2"
                        >
                          Connect
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Security note */}
      <p className="mt-8 text-xs text-muted-foreground">
        NativPost uses official platform APIs with OAuth 2.0. Credentials are encrypted and stored securely.
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
