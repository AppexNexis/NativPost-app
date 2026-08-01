'use client';

/**
 * TikTokSettingsFields — the TikTok publishing options, as a reusable block.
 *
 * Used in two places with the same shape:
 *   - Campaign wizard (Accounts step) → campaign.platformSettings.tiktok
 *   - Connections settings           → socialAccount.metadata.tiktokDefaults
 *
 * Both write `TikTokPublishConfig`, which `resolveTikTokSettings` reads at
 * publish time. That's what removes guessing from scheduled publishing: the
 * campaign holds the user's intent, the account holds reusable defaults, and
 * the publisher only executes them (validated against live creator_info).
 *
 * In campaign mode the privacy select offers "Use account default", which
 * stores the USE_ACCOUNT_DEFAULT sentinel rather than a frozen enum — so an
 * account TikTok later restricts adapts at publish time instead of failing.
 */

import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { TikTokPrivacyLevel, TikTokPublishConfig } from '@/lib/tiktok/resolve-settings';
import { TIKTOK_PRIVACY_LEVELS, USE_ACCOUNT_DEFAULT } from '@/lib/tiktok/resolve-settings';

const PRIVACY_LABELS: Record<string, string> = {
  PUBLIC_TO_EVERYONE: 'Everyone',
  MUTUAL_FOLLOW_FRIENDS: 'Friends',
  FOLLOWER_OF_CREATOR: 'Followers',
  SELF_ONLY: 'Only me (private)',
};

type Props = {
  value: TikTokPublishConfig;
  onChange: (next: TikTokPublishConfig) => void;
  /**
   * 'campaign' offers "Use account default" for privacy; 'account' is the
   * bottom of the hierarchy so it must resolve to a real value.
   */
  mode: 'campaign' | 'account';
};

export function TikTokSettingsFields({ value, onChange, mode }: Props) {
  const set = <K extends keyof TikTokPublishConfig>(key: K, v: TikTokPublishConfig[K]) =>
    onChange({ ...value, [key]: v });

  const isInbox = value.publishMethod === 'INBOX';
  const privacyValue = value.privacyLevel
    ?? (mode === 'campaign' ? USE_ACCOUNT_DEFAULT : 'PUBLIC_TO_EVERYONE');
  const isPrivate = privacyValue === 'SELF_ONLY';

  return (
    <div className="space-y-5">
      {/* Publishing method */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Publishing method</Label>
        <div className="grid grid-cols-2 gap-2">
          {([
            { v: 'DIRECT' as const, title: 'Direct publish', hint: 'Posts straight to the account' },
            { v: 'INBOX' as const, title: 'Send to inbox', hint: 'Lands in TikTok drafts to finish there' },
          ]).map(opt => (
            <button
              key={opt.v}
              type="button"
              onClick={() => set('publishMethod', opt.v)}
              className={`rounded-lg border-2 p-3 text-left transition-colors ${
                (value.publishMethod ?? 'DIRECT') === opt.v
                  ? 'border-[#FE2C55] bg-[#FE2C55]/5'
                  : 'border-border hover:border-muted-foreground/40'
              }`}
            >
              <span className="block text-sm font-medium">{opt.title}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{opt.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Everything below is set by the creator inside TikTok for inbox
          uploads, so we don't pretend to control it here. */}
      {isInbox
        ? (
            <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
              Inbox uploads land in TikTok drafts. Privacy, interactions and disclosure
              are chosen in the TikTok app when the post is finished there.
            </p>
          )
        : (
            <>
              {/* Privacy */}
              <div className="space-y-2">
                <Label className="text-sm font-medium" htmlFor="tiktok-privacy">Privacy</Label>
                <select
                  id="tiktok-privacy"
                  value={privacyValue}
                  onChange={e => set('privacyLevel', e.target.value as TikTokPrivacyLevel)}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
                >
                  {mode === 'campaign' && (
                    <option value={USE_ACCOUNT_DEFAULT}>Use account default</option>
                  )}
                  {TIKTOK_PRIVACY_LEVELS.map(level => (
                    <option key={level} value={level}>{PRIVACY_LABELS[level] ?? level}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Checked against what TikTok allows this account at publish time. If the
                  choice isn't available then, the closest permitted option is used.
                </p>
              </div>

              {/* Interactions */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Interactions</Label>
                {([
                  { key: 'allowComment' as const, label: 'Allow comments' },
                  { key: 'allowDuet' as const, label: 'Allow Duet' },
                  { key: 'allowStitch' as const, label: 'Allow Stitch' },
                ]).map(opt => (
                  <div key={opt.key} className="flex items-center justify-between">
                    <span className="text-sm">{opt.label}</span>
                    <Switch
                      checked={value[opt.key] ?? true}
                      onCheckedChange={c => set(opt.key, c)}
                    />
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  Your TikTok account settings win: anything disabled there stays disabled.
                </p>
              </div>

              {/* Disclosure */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Content disclosure</Label>
                <div className="flex items-center justify-between">
                  <span className="text-sm">
                    AI-generated content
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      TikTok policy expects AI-generated posts to be disclosed.
                    </span>
                  </span>
                  <Switch
                    checked={value.isAIGC ?? true}
                    onCheckedChange={c => set('isAIGC', c)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm">
                    Your own brand
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      Promotes your own business.
                    </span>
                  </span>
                  <Switch
                    checked={value.brandOrganicToggle ?? false}
                    onCheckedChange={c => set('brandOrganicToggle', c)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className={`text-sm ${isPrivate ? 'opacity-50' : ''}`}>
                    Branded content
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {isPrivate
                        ? 'Unavailable on private posts.'
                        : 'Paid partnership with another brand.'}
                    </span>
                  </span>
                  <Switch
                    disabled={isPrivate}
                    checked={!isPrivate && (value.brandContentToggle ?? false)}
                    onCheckedChange={c => set('brandContentToggle', c)}
                  />
                </div>
              </div>
            </>
          )}
    </div>
  );
}
