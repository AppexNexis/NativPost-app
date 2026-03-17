'use client';

import { AlertCircle, Check, Loader2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState, Suspense } from 'react';

import { PLATFORMS } from '@/components/icons/PlatformIcons';

interface SocialAccount {
  id: string;
  platform: string;
  platformUsername: string | null;
  accountType: string | null;
  profileImageUrl: string | null;
  isActive: boolean;
  connectedAt: string;
}

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
    if (!confirm('Disconnect this account? You can reconnect later.')) return;
    setDisconnecting(accountId);
    try {
      await fetch(`/api/social-accounts?id=${accountId}`, { method: 'DELETE' });
      setAccounts((prev) => prev.filter((a) => a.id !== accountId));
    } finally {
      setDisconnecting(null);
    }
  };

  const getAccount = (platformId: string) =>
    accounts.find((a) => a.platform === platformId && a.isActive);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Connected Accounts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect your social media platforms to publish content.
        </p>
      </div>

      {successPlatform && (
        <div className="mb-5 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          <Check className="size-4" />
          <span className="capitalize">{successPlatform}</span> connected successfully.
        </div>
      )}
      {errorType && (
        <div className="mb-5 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="size-4" />
          Connection failed. Please try again.
        </div>
      )}

      {isLoading ? (
        <div className="flex min-h-[300px] items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-2">
          {PLATFORMS.map((platform) => {
            const PIcon = platform.icon;
            const account = getAccount(platform.id);
            const connected = !!account;

            return (
              <div
                key={platform.id}
                className="flex items-center gap-4 rounded-lg border bg-card px-5 py-4"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <PIcon className="size-5 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{platform.name}</p>
                  {connected ? (
                    <p className="text-xs text-[#16A34A]">
                      {account.platformUsername ? `@${account.platformUsername}` : 'Connected'}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Not connected</p>
                  )}
                </div>
                {connected ? (
                  <div className="flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded-full bg-[#16A34A]">
                      <Check className="size-3 text-white" />
                    </span>
                    <button
                      onClick={() => disconnectAccount(account.id)}
                      disabled={disconnecting === account.id}
                      className="rounded-lg border px-3 py-1.5 text-xs font-medium text-red-500 transition-colors hover:bg-red-50 disabled:opacity-50"
                    >
                      {disconnecting === account.id ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        'Disconnect'
                      )}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => connectPlatform(platform.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-4 py-2 text-xs font-medium text-background transition-colors hover:opacity-90"
                  >
                    Connect {platform.name}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-6 text-xs text-muted-foreground">
        NativPost uses official platform APIs with OAuth 2.0. Your credentials are encrypted and stored
        securely. We never post without your explicit approval.
      </p>
    </>
  );
}

export default function ConnectionsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[300px] items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <ConnectionsContent />
    </Suspense>
  );
}