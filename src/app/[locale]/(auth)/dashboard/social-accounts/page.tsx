// import { Link2, Plus } from 'lucide-react';
import { Plus } from 'lucide-react';

// import { EmptyState } from '@/features/dashboard/EmptyState';
import { PageHeader } from '@/features/dashboard/PageHeader';

const PLATFORMS = [
  { id: 'instagram', name: 'Instagram', icon: '📸', color: '#E4405F' },
  { id: 'facebook', name: 'Facebook', icon: '📘', color: '#1877F2' },
  { id: 'linkedin', name: 'LinkedIn', icon: '💼', color: '#0A66C2' },
  { id: 'twitter', name: 'X / Twitter', icon: '𝕏', color: '#000000' },
  { id: 'tiktok', name: 'TikTok', icon: '🎵', color: '#000000' },
];

export default function SocialAccountsPage() {
  return (
    <>
      <PageHeader
        title="Social Accounts"
        description="Connect your social media platforms to publish content directly from NativPost."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PLATFORMS.map((platform) => (
          <div
            key={platform.id}
            className="flex items-center justify-between rounded-xl border bg-background p-5"
          >
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-lg">
                {platform.icon}
              </div>
              <div>
                <p className="text-sm font-medium">{platform.name}</p>
                <p className="text-xs text-muted-foreground">Not connected</p>
              </div>
            </div>
            <button className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors hover:bg-muted">
              <Plus className="size-3" />
              Connect
            </button>
          </div>
        ))}
      </div>

      <div className="mt-8">
        <p className="text-xs text-muted-foreground">
          NativPost uses official platform APIs. Your credentials are encrypted and stored
          securely. You can disconnect any platform at any time.
        </p>
      </div>
    </>
  );
}
