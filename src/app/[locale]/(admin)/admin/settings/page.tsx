'use client';

/**
 * src/app/[locale]/(admin)/admin/settings/page.tsx
 *
 * Admin settings — support system configuration.
 */

import {
  Bot,
  CheckCircle2,
  // Clock,
  Mail,
  Save,
  Shield,
  Zap,
} from 'lucide-react';
import { useState } from 'react';

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-6 py-5">
      <div className="flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
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
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
        checked ? 'bg-primary' : 'bg-muted-foreground/30'
      }`}
    >
      <span
        className={`pointer-events-none inline-block size-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

export default function AdminSettingsPage() {
  const [saved, setSaved] = useState(false);

  // Settings state — in a real implementation these would be fetched from
  // a settings table and persisted via an API route
  const [autoReply,        setAutoReply]        = useState(true);
  const [autoResolve,      setAutoResolve]       = useState(true);
  const [csatEnabled,      setCsatEnabled]       = useState(true);
  const [emailNotify,      setEmailNotify]       = useState(true);
  const [internalKBOnly,   setInternalKBOnly]    = useState(false);
  const [confidenceThreshold, setConfidenceThreshold] = useState(70);
  const [responseHours,    setResponseHours]     = useState(4);

  const saveSettings = () => {
    // Settings are stored client-side for now.
    // Wire to /api/admin/settings when persistence is needed.
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Support system configuration
          </p>
        </div>
        <button
          onClick={saveSettings}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {saved ? (
            <>
              <CheckCircle2 className="size-4" />
              Saved
            </>
          ) : (
            <>
              <Save className="size-4" />
              Save settings
            </>
          )}
        </button>
      </div>

      <div className="space-y-4">
        {/* AI section */}
        <div className="rounded-xl border bg-card">
          <div className="flex items-center gap-2 border-b px-5 py-4">
            <Bot className="size-4 text-emerald-600" />
            <p className="text-sm font-semibold">AI support</p>
          </div>
          <div className="divide-y px-5">
            <SettingRow
              label="AI auto-reply on new tickets"
              description="When a ticket is created, the AI sends an immediate acknowledgment or attempts to resolve it."
            >
              <Toggle checked={autoReply} onChange={setAutoReply} />
            </SettingRow>

            <SettingRow
              label="AI auto-resolve"
              description="Tickets the AI can fully answer are marked resolved automatically. Agents can review and reopen."
            >
              <Toggle checked={autoResolve} onChange={setAutoResolve} />
            </SettingRow>

            <SettingRow
              label="Confidence threshold"
              description="Minimum AI confidence required to auto-resolve a ticket. Higher = more conservative."
            >
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={50}
                  max={95}
                  step={5}
                  value={confidenceThreshold}
                  onChange={(e) => setConfidenceThreshold(Number(e.target.value))}
                  className="w-28"
                />
                <span className="w-10 text-right text-sm font-medium">{confidenceThreshold}%</span>
              </div>
            </SettingRow>

            <SettingRow
              label="Use internal KB articles for AI"
              description="Allow the AI to reference internal-only articles when generating responses."
            >
              <Toggle checked={internalKBOnly} onChange={setInternalKBOnly} />
            </SettingRow>
          </div>
        </div>

        {/* Email section */}
        <div className="rounded-xl border bg-card">
          <div className="flex items-center gap-2 border-b px-5 py-4">
            <Mail className="size-4 text-blue-600" />
            <p className="text-sm font-semibold">Email notifications</p>
          </div>
          <div className="divide-y px-5">
            <SettingRow
              label="Send ticket confirmation emails"
              description="Clients receive an email when their ticket is created and when it is resolved."
            >
              <Toggle checked={emailNotify} onChange={setEmailNotify} />
            </SettingRow>

            <SettingRow
              label="Expected response time"
              description="Shown to clients in the ticket confirmation email."
            >
              <div className="flex items-center gap-2">
                <select
                  value={responseHours}
                  onChange={(e) => setResponseHours(Number(e.target.value))}
                  className="rounded-lg border bg-background px-3 py-1.5 text-sm focus:outline-none"
                >
                  <option value={1}>1 hour</option>
                  <option value={2}>2 hours</option>
                  <option value={4}>4 hours</option>
                  <option value={8}>8 hours</option>
                  <option value={24}>24 hours</option>
                </select>
              </div>
            </SettingRow>
          </div>
        </div>

        {/* CSAT section */}
        <div className="rounded-xl border bg-card">
          <div className="flex items-center gap-2 border-b px-5 py-4">
            <Zap className="size-4 text-amber-600" />
            <p className="text-sm font-semibold">Customer satisfaction</p>
          </div>
          <div className="divide-y px-5">
            <SettingRow
              label="CSAT survey on ticket close"
              description="Send a star rating survey when a ticket is marked resolved."
            >
              <Toggle checked={csatEnabled} onChange={setCsatEnabled} />
            </SettingRow>
          </div>
        </div>

        {/* Security info */}
        <div className="rounded-xl border border-muted bg-muted/20 p-5">
          <div className="flex items-start gap-3">
            <Shield className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Admin access</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                This panel is accessible only to NativPost team members whose active organisation
                matches the internal NativPost org. Access is enforced at the middleware layer — no
                client can reach these pages regardless of their Clerk role.
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                To add a team member: invite them to the NativPost internal org in Clerk
                and grant them the org:admin role.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}