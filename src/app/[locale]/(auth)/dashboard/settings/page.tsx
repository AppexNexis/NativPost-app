'use client';

import {
  Bell,
  Building2,
  ChevronRight,
  Coins,
  KeyRound,
  Layout,
  Loader2,
  Palette,
  PenLine,
  Save,
} from 'lucide-react';
import { parseAsStringLiteral, useQueryState } from 'nuqs';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiKeysPanel } from '@/components/settings/api-keys/ApiKeysPanel';
import { CreditsPanel } from '@/components/settings/credits/CreditsPanel';
import { PageHeader } from '@/features/dashboard/PageHeader';
import { CONTENT_LANGUAGE_GROUPS, CONTENT_LANGUAGES } from '@/lib/content-languages';
import { PLATFORM_LABELS } from '@/lib/platforms';

// -----------------------------------------------------------
// Types
// -----------------------------------------------------------
type OrgSettings = {
  timezone: string;
  contentLanguage: string;
  defaultContentMode: string;
  defaultPlatforms: string[];
  defaultVariantCount: number;
  hashtagStrategy: string;
  hashtagCount: number;
  antiSlopThreshold: number;
  autoSchedule: boolean;
  defaultPostTime: string;
};

type UserPrefs = {
  theme: string;
  notifyPublish: boolean;
  notifyFailure: boolean;
  notifyApproval: boolean;
  notifyBilling: boolean;
  sidebarDensity: string;
};

const TAB_KEYS = ['workspace', 'notifications', 'publishing', 'content', 'appearance', 'credits', 'api-keys'] as const;
type TabKey = typeof TAB_KEYS[number];

const TABS: { key: TabKey; label: string; icon: typeof Building2 }[] = [
  { key: 'workspace', label: 'Workspace', icon: Building2 },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'publishing', label: 'Publishing', icon: PenLine },
  { key: 'content', label: 'Content', icon: Layout },
  { key: 'credits', label: 'Credits', icon: Coins },
  { key: 'api-keys', label: 'API keys', icon: KeyRound },
  { key: 'appearance', label: 'Appearance', icon: Palette },
];

const PANEL_TABS: TabKey[] = ['credits', 'api-keys'];

const TIMEZONES = [
  'Africa/Lagos',
  'Africa/Nairobi',
  'Africa/Accra',
  'Africa/Johannesburg',
  'Africa/Cairo',
  'Africa/Casablanca',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'America/Toronto',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'UTC',
];

const PLATFORMS = [
  'instagram',
  'linkedin',
  'linkedin_page',
  'twitter',
  'facebook',
  'tiktok',
  'youtube',
  'threads',
  'pinterest',
];

const DEFAULT_ORG_SETTINGS: OrgSettings = {
  timezone: 'Africa/Lagos',
  contentLanguage: 'en',
  defaultContentMode: 'normal',
  defaultPlatforms: ['instagram', 'linkedin'],
  defaultVariantCount: 3,
  hashtagStrategy: 'auto',
  hashtagCount: 8,
  antiSlopThreshold: 0.7,
  autoSchedule: false,
  defaultPostTime: '09:00',
};

const DEFAULT_USER_PREFS: UserPrefs = {
  theme: 'system',
  notifyPublish: true,
  notifyFailure: true,
  notifyApproval: true,
  notifyBilling: true,
  sidebarDensity: 'comfortable',
};

// -----------------------------------------------------------
// applyTheme — updates <html> class only, never called on page load.
// The layout already applied the correct theme before this page mounted.
// Only called when the user actively picks a new theme.
// -----------------------------------------------------------
function applyTheme(theme: string) {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else if (theme === 'light') {
    root.classList.remove('dark');
  } else {
    // System — follow the OS preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', prefersDark);
  }
  // Persist in a cookie so the root layout can apply the class on next page load (no flash)
  try {
    document.cookie = `np-theme=${theme}; path=/; max-age=31536000; SameSite=Lax`;
  } catch { /* ignore */ }
}

// -----------------------------------------------------------
// Form row helpers
// -----------------------------------------------------------
function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 py-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="max-w-sm">
        <p className="text-sm font-medium">{label}</p>
        {description && (
          <p className="mt-0.5 text-meta text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="sm:min-w-[200px]">{children}</div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        checked ? 'bg-primary' : 'bg-input'
      }`}
    >
      <span
        className={`pointer-events-none block size-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

// -----------------------------------------------------------
// Main component
// -----------------------------------------------------------
export default function SettingsPage() {
  const [activeTab, setActiveTab] = useQueryState(
    'tab',
    parseAsStringLiteral(TAB_KEYS).withDefault('workspace'),
  );
  const [orgSettings, setOrgSettings] = useState<OrgSettings>(DEFAULT_ORG_SETTINGS);
  const [userPrefs, setUserPrefs] = useState<UserPrefs>(DEFAULT_USER_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [themeSaving, setThemeSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  // Load settings on mount.
  // IMPORTANT: we do NOT call applyTheme here. The theme was already applied
  // by the root layout (or a ThemeProvider) before this component mounted.
  // Calling applyTheme here would reset the user's current session theme to
  // whatever the server last stored — causing the "switches back to system" bug.
  useEffect(() => {
    Promise.all([
      fetch('/api/settings/org').then(r => r.ok ? r.json() : null),
      fetch('/api/settings/user').then(r => r.ok ? r.json() : null),
    ]).then(([org, user]) => {
      if (org) {
        setOrgSettings(s => ({ ...s, ...org }));
      }
      // Sync UI state only — do not touch the DOM theme here
      if (user) {
        setUserPrefs(s => ({ ...s, ...user }));
      }
    }).finally(() => setLoading(false));
  }, []);

  const saveOrgSettings = useCallback(async (settings: OrgSettings) => {
    setSaving(true);
    try {
      await fetch('/api/settings/org', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      setSaved(true);
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }, []);

  const saveUserPrefs = useCallback(async (prefs: UserPrefs) => {
    setSaving(true);
    try {
      await fetch('/api/settings/user', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      });
      setSaved(true);
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }, []);

  const updateOrg = <K extends keyof OrgSettings>(key: K, value: OrgSettings[K]) => {
    setOrgSettings(prev => ({ ...prev, [key]: value }));
  };

  const updateUser = <K extends keyof UserPrefs>(key: K, value: UserPrefs[K]) => {
    setUserPrefs(prev => ({ ...prev, [key]: value }));
  };

  // Theme is the one setting that saves immediately and silently —
  // it must feel instant. No "Save changes" click required.
  const handleThemeChange = async (theme: string) => {
    // 1. Apply to DOM immediately — user sees the change right away
    applyTheme(theme);
    // 2. Update local state so the selected button reflects the choice
    setUserPrefs(prev => ({ ...prev, theme }));
    // 3. Persist to server silently (no spinner on the main save button)
    setThemeSaving(true);
    try {
      await fetch('/api/settings/user', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme }),
      });
    } catch {
      // Non-fatal — theme is still applied in DOM, will retry on next full save
    } finally {
      setThemeSaving(false);
    }
  };

  const handleSave = async () => {
    if (PANEL_TABS.includes(activeTab)) {
      return;
    }
    const isOrgTab = ['workspace', 'publishing', 'content'].includes(activeTab);
    if (isOrgTab) {
      await saveOrgSettings(orgSettings);
    } else {
      await saveUserPrefs(userPrefs);
    }
  };

  const togglePlatform = (platform: string) => {
    const next = orgSettings.defaultPlatforms.includes(platform)
      ? orgSettings.defaultPlatforms.filter(p => p !== platform)
      : [...orgSettings.defaultPlatforms, platform];
    updateOrg('defaultPlatforms', next);
  };

  if (loading) {
    return (
      <>
        <PageHeader title="Settings" description="Manage your workspace configuration and preferences." />
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Settings"
        description="Manage your workspace configuration and preferences."
        actions={
          PANEL_TABS.includes(activeTab)
            ? undefined
            : (
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
                >
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  {saving ? 'Saving' : saved ? 'Saved' : 'Save changes'}
                </button>
              )
        }
      />

      <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
        {/* Tab sidebar */}
        <nav className="flex shrink-0 flex-row gap-1 overflow-x-auto lg:w-44 lg:flex-col">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  void setActiveTab(tab.key);
                }}
                className={`flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2.5 text-ui font-medium transition-colors lg:w-full ${
                  activeTab === tab.key
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon className="size-4 shrink-0" />
                {tab.label}
                {activeTab === tab.key && (
                  <ChevronRight className="ml-auto hidden size-3.5 lg:block" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Tab content */}
        <div className={
          PANEL_TABS.includes(activeTab)
            ? 'flex-1'
            : 'flex-1 rounded-xl border bg-background'
        }
        >
          <div className={PANEL_TABS.includes(activeTab) ? '' : 'divide-y px-6'}>

            {/* ── Credits ── */}
            {activeTab === 'credits' && <CreditsPanel />}

            {/* ── API keys ── */}
            {activeTab === 'api-keys' && <ApiKeysPanel />}

            {/* ── Workspace ── */}
            {activeTab === 'workspace' && (
              <>
                <SettingRow label="Timezone" description="Used for scheduling and calendar display.">
                  <Select
                    value={orgSettings.timezone}
                    onChange={v => updateOrg('timezone', v)}
                    options={TIMEZONES.map(tz => ({ value: tz, label: tz.replace('_', ' ') }))}
                  />
                </SettingRow>
                <SettingRow label="Content language" description="Primary language for AI-generated content — captions, hooks, and hashtags are written in this language.">
                  <select
                    value={orgSettings.contentLanguage}
                    onChange={e => updateOrg('contentLanguage', e.target.value)}
                    aria-label="Content language"
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    {CONTENT_LANGUAGE_GROUPS.map(group => (
                      <optgroup key={group.region} label={group.region}>
                        {group.languages.map(lang => (
                          <option key={lang.value} value={lang.value}>
                            {lang.label === lang.native ? lang.label : `${lang.label} — ${lang.native}`}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                    {/* Preserve an unknown stored code instead of silently re-mapping it */}
                    {!CONTENT_LANGUAGES.some(l => l.value === orgSettings.contentLanguage) && (
                      <option value={orgSettings.contentLanguage}>{orgSettings.contentLanguage}</option>
                    )}
                  </select>
                </SettingRow>
                <SettingRow label="Team members" description="Manage roles and invitations.">
                  <a
                    href="/dashboard/team"
                    className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-body text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    Manage team
                    <ChevronRight className="size-3.5" />
                  </a>
                </SettingRow>
              </>
            )}

            {/* ── Notifications ── */}
            {activeTab === 'notifications' && (
              <>
                <SettingRow label="Post published" description="Alert when a scheduled post goes live.">
                  <Toggle checked={userPrefs.notifyPublish} onChange={v => updateUser('notifyPublish', v)} />
                </SettingRow>
                <SettingRow label="Publish failure" description="Alert when a post fails to publish.">
                  <Toggle checked={userPrefs.notifyFailure} onChange={v => updateUser('notifyFailure', v)} />
                </SettingRow>
                <SettingRow label="Approval needed" description="Alert when content enters the approval queue.">
                  <Toggle checked={userPrefs.notifyApproval} onChange={v => updateUser('notifyApproval', v)} />
                </SettingRow>
                <SettingRow label="Billing alerts" description="Payment failures and plan limit warnings.">
                  <Toggle checked={userPrefs.notifyBilling} onChange={v => updateUser('notifyBilling', v)} />
                </SettingRow>
                <SettingRow label="Messaging channels" description="Get alerts on WhatsApp, Telegram, or Discord.">
                  <a
                    href="https://connect.nativpost.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-body text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    Set up Connect
                    <ChevronRight className="size-3.5" />
                  </a>
                </SettingRow>
              </>
            )}

            {/* ── Publishing ── */}
            {activeTab === 'publishing' && (
              <>
                <SettingRow label="Default platforms" description="Pre-selected platforms when creating a new post.">
                  <div className="flex flex-wrap gap-2">
                    {PLATFORMS.map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => togglePlatform(p)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                          orgSettings.defaultPlatforms.includes(p)
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        {PLATFORM_LABELS[p]}
                      </button>
                    ))}
                  </div>
                </SettingRow>
                <SettingRow label="Auto-schedule" description="Automatically schedule approved posts to the next available slot.">
                  <Toggle checked={orgSettings.autoSchedule} onChange={v => updateOrg('autoSchedule', v)} />
                </SettingRow>
                <SettingRow label="Default post time" description="Used when auto-scheduling. In your workspace timezone.">
                  <input
                    type="time"
                    value={orgSettings.defaultPostTime}
                    onChange={e => updateOrg('defaultPostTime', e.target.value)}
                    className="rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </SettingRow>
              </>
            )}

            {/* ── Content ── */}
            {activeTab === 'content' && (
              <>
                <SettingRow label="Default content mode" description="Mode applied when creating a new post.">
                  <Select
                    value={orgSettings.defaultContentMode}
                    onChange={v => updateOrg('defaultContentMode', v)}
                    options={[
                      { value: 'normal', label: 'Normal' },
                      { value: 'concise', label: 'Concise' },
                      { value: 'controversial', label: 'Controversial' },
                    ]}
                  />
                </SettingRow>
                <SettingRow label="Variants per generation" description="How many caption variants the AI generates.">
                  <Select
                    value={String(orgSettings.defaultVariantCount)}
                    onChange={v => updateOrg('defaultVariantCount', Number(v))}
                    options={[
                      { value: '1', label: '1 variant' },
                      { value: '2', label: '2 variants' },
                      { value: '3', label: '3 variants (recommended)' },
                    ]}
                  />
                </SettingRow>
                <SettingRow label="Hashtag strategy" description="How hashtags are added to generated posts.">
                  <Select
                    value={orgSettings.hashtagStrategy}
                    onChange={v => updateOrg('hashtagStrategy', v)}
                    options={[
                      { value: 'auto', label: 'Auto (AI picks count)' },
                      { value: 'custom', label: 'Custom count' },
                      { value: 'none', label: 'None' },
                    ]}
                  />
                </SettingRow>
                {orgSettings.hashtagStrategy === 'custom' && (
                  <SettingRow label="Hashtag count" description="Number of hashtags to add per post.">
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={orgSettings.hashtagCount}
                      onChange={e => updateOrg('hashtagCount', Number(e.target.value))}
                      className="w-24 rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </SettingRow>
                )}
                <SettingRow
                  label="Quality threshold"
                  description="Minimum anti-slop score. Posts below this are automatically rejected."
                >
                  <Select
                    value={String(orgSettings.antiSlopThreshold)}
                    onChange={v => updateOrg('antiSlopThreshold', Number(v))}
                    options={[
                      { value: '0.6', label: 'Lenient (0.6)' },
                      { value: '0.7', label: 'Standard (0.7) — recommended' },
                      { value: '0.8', label: 'Strict (0.8)' },
                    ]}
                  />
                </SettingRow>
              </>
            )}

            {/* ── Appearance ── */}
            {activeTab === 'appearance' && (
              <>
                <SettingRow
                  label="Theme"
                  description="Your display preference. Saves instantly and syncs across all your devices."
                >
                  <div className="flex items-center gap-2">
                    {[
                      { value: 'light', label: 'Light' },
                      { value: 'dark', label: 'Dark' },
                      { value: 'system', label: 'System' },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleThemeChange(opt.value)}
                        disabled={themeSaving}
                        className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60 ${
                          userPrefs.theme === opt.value
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                    {themeSaving && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
                  </div>
                </SettingRow>
                <SettingRow label="Sidebar density" description="Adjusts spacing in the navigation sidebar.">
                  <div className="flex gap-2">
                    {[
                      { value: 'comfortable', label: 'Comfortable' },
                      { value: 'compact', label: 'Compact' },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => updateUser('sidebarDensity', opt.value)}
                        className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                          userPrefs.sidebarDensity === opt.value
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </SettingRow>
              </>
            )}

          </div>
        </div>
      </div>
    </>
  );
}
