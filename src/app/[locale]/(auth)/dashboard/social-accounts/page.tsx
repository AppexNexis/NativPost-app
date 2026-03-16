'use client';

import {
  AlertCircle,
  Check,
  // ExternalLink,
  // Link2,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { PageHeader } from '@/features/dashboard/PageHeader';

interface SocialAccount {
  id: string;
  platform: string;
  platformUsername: string | null;
  accountType: string | null;
  profileImageUrl: string | null;
  isActive: boolean;
  connectedAt: string;
}

const PLATFORMS = [
  { id: 'instagram', name: 'Instagram', emoji: '📸', color: '#E4405F' },
  { id: 'facebook', name: 'Facebook', emoji: '📘', color: '#1877F2' },
  { id: 'linkedin', name: 'LinkedIn', emoji: '💼', color: '#0A66C2' },
  { id: 'twitter', name: 'X / Twitter', emoji: '𝕏', color: '#000000' },
  { id: 'tiktok', name: 'TikTok', emoji: '🎵', color: '#000000' },
];

export default function SocialAccountsPage() {
  const searchParams = useSearchParams();
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  const successPlatform = searchParams.get('success');
  const errorType = searchParams.get('error');
  const errorPlatform = searchParams.get('platform');

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

  const connectPlatform = (platformId: string) => {
    // Redirect to OAuth initiation endpoint
    window.location.href = `/api/social-accounts/connect?platform=${platformId}`;
  };

  const disconnectAccount = async (accountId: string) => {
    if (!confirm('Disconnect this account? You can reconnect it later.')) return;
    setDisconnecting(accountId);
    try {
      await fetch(`/api/social-accounts?id=${accountId}`, { method: 'DELETE' });
      setAccounts((prev) => prev.filter((a) => a.id !== accountId));
    } catch (err) {
      console.error('Failed to disconnect:', err);
    } finally {
      setDisconnecting(null);
    }
  };

  const isConnected = (platformId: string) =>
    accounts.some((a) => a.platform === platformId && a.isActive);

  const getAccount = (platformId: string) =>
    accounts.find((a) => a.platform === platformId && a.isActive);

  return (
    <>
      <PageHeader
        title="Social Accounts"
        description="Connect your social media platforms to publish content directly from NativPost."
      />

      {/* Success/Error banners */}
      {successPlatform && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          <Check className="size-4 shrink-0" />
          <span className="capitalize">{successPlatform}</span> connected successfully!
        </div>
      )}
      {errorType && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="size-4 shrink-0" />
          Failed to connect {errorPlatform || 'platform'}.
          {errorType === 'token_exchange_failed' && ' Please try again.'}
          {errorType === 'auth' && ' Please sign in first.'}
        </div>
      )}

      {isLoading ? (
        <div className="flex min-h-[300px] items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PLATFORMS.map((platform) => {
              const connected = isConnected(platform.id);
              const account = getAccount(platform.id);

              return (
                <div
                  key={platform.id}
                  className={`rounded-xl border bg-card p-5 transition-all ${
                    connected ? 'border-[#16A34A]/30' : ''
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-lg">
                        {platform.emoji}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{platform.name}</p>
                        {connected && account ? (
                          <p className="text-xs text-[#16A34A]">
                            @{account.platformUsername || 'Connected'}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">Not connected</p>
                        )}
                      </div>
                    </div>
                    {connected && (
                      <div className="flex size-5 items-center justify-center rounded-full bg-[#16A34A]">
                        <Check className="size-3 text-white" />
                      </div>
                    )}
                  </div>

                  <div className="mt-4">
                    {connected ? (
                      <div className="flex gap-2">
                        <span className="flex-1 rounded-lg bg-[#16A34A]/5 px-3 py-2 text-center text-xs font-medium text-[#16A34A]">
                          Connected
                        </span>
                        <button
                          onClick={() => account && disconnectAccount(account.id)}
                          disabled={disconnecting === account?.id}
                          className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-medium text-red-500 transition-colors hover:bg-red-50 disabled:opacity-60"
                        >
                          {disconnecting === account?.id ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <Trash2 className="size-3" />
                          )}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => connectPlatform(platform.id)}
                        className="flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors hover:bg-muted"
                      >
                        <Plus className="size-3" />
                        Connect {platform.name}
                      </button>
                    )}
                  </div>

                  {connected && account?.connectedAt && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Connected {new Date(account.connectedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-8 rounded-lg bg-muted/50 p-4">
            <p className="text-xs text-muted-foreground">
              NativPost uses official platform APIs with OAuth 2.0. Your credentials are encrypted
              and stored securely. You can disconnect any platform at any time. We never post
              without your explicit approval.
            </p>
          </div>
        </>
      )}
    </>
  );
}
