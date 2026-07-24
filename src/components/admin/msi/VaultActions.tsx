'use client';

import { Copy, KeyRound, ShieldAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

// Operations vault surface (docs §9). Two dual-authorized actions:
//   1. Capture — an operator seals the account's login into the vault.
//   2. Release — staff completes a customer-requested off-board, revealing the
//      credentials once for secure handoff.
// Staff-gated by middleware (/admin(.*)); the plaintext is never persisted in
// Postgres and is shown here only at the moment of release.
export function VaultActions({
  accountId,
  custody,
  hasCredentials,
}: {
  accountId: string;
  custody: string;
  hasCredentials: boolean;
}) {
  const router = useRouter();
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState<'capture' | 'release' | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);

  const captureCredentials = async () => {
    if (!secret.trim()) {
      return;
    }
    setBusy('capture');
    try {
      const res = await fetch(
        `/api/admin/msi/accounts/${accountId}/credentials`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credentials: secret }),
        },
      );
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || `Server returned ${res.status}`);
      }
      setSecret('');
      toast.success('Credentials sealed in the vault');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Capture failed');
    } finally {
      setBusy(null);
    }
  };

  const releaseCredentials = async () => {
    setBusy('release');
    try {
      const res = await fetch(`/api/admin/msi/accounts/${accountId}/release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(b.error || `Server returned ${res.status}`);
      }
      if (typeof b.credentials === 'string') {
        setRevealed(b.credentials);
      } else {
        toast.success('Account released. No stored credentials to hand over.');
      }
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Release failed');
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    if (!revealed) {
      return;
    }
    try {
      await navigator.clipboard.writeText(revealed);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Copy failed — select the text manually');
    }
  };

  return (
    <section className="mt-6">
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <KeyRound className="size-4" />
        Credential vault
      </h2>

      <div className="space-y-4 rounded-xl border border-border bg-card p-4">
        {/* One-time reveal after a release. */}
        {revealed !== null
          ? (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                  <ShieldAlert className="size-4" />
                  Shown once — hand these to the customer, then discard
                </div>
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-background p-3 text-xs text-foreground">
                  {revealed}
                </pre>
                <Button size="sm" variant="outline" className="mt-2" onClick={copy}>
                  <Copy className="size-3.5" />
                  Copy
                </Button>
              </div>
            )
          : null}

        {/* Release — only when the customer has requested an off-board. */}
        {custody === 'transfer_requested'
          ? (
              <div className="rounded-lg border border-border bg-background p-3">
                <p className="text-xs text-muted-foreground">
                  The customer requested to take over this account. Releasing
                  archives it, deactivates its publish connection, and reveals
                  the stored credentials once for handoff.
                </p>
                <Button
                  size="sm"
                  className="mt-2"
                  disabled={busy !== null}
                  onClick={releaseCredentials}
                >
                  {busy === 'release' ? 'Releasing…' : 'Release & reveal credentials'}
                </Button>
              </div>
            )
          : null}

        {custody === 'released'
          ? (
              <p className="text-xs text-muted-foreground">
                Credentials have been released to the customer. This account is
                off-boarded.
              </p>
            )
          : null}

        {/* Capture — available while NativPost operates the account. */}
        {custody !== 'released'
          ? (
              <div>
                <label
                  htmlFor="vault-secret"
                  className="text-xs font-medium text-foreground"
                >
                  {hasCredentials
                    ? 'Update stored credentials'
                    : 'Capture account credentials'}
                </label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {hasCredentials
                    ? 'Credentials are sealed in the vault. Submitting replaces them (rotation).'
                    : 'Paste the login (username, password, email, 2FA notes). Encrypted on submit — never stored in plaintext.'}
                </p>
                <Textarea
                  id="vault-secret"
                  value={secret}
                  onChange={e => setSecret(e.target.value)}
                  placeholder={'username: …\npassword: …\nrecovery email: …'}
                  rows={4}
                  className="mt-2 font-mono text-xs"
                  autoComplete="off"
                  spellCheck={false}
                />
                <Button
                  size="sm"
                  className="mt-2"
                  disabled={busy !== null || !secret.trim()}
                  onClick={captureCredentials}
                >
                  {busy === 'capture'
                    ? 'Sealing…'
                    : hasCredentials
                      ? 'Update credentials'
                      : 'Seal into vault'}
                </Button>
                {hasCredentials
                  ? (
                      <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400">
                        ✓ Sealed
                      </span>
                    )
                  : null}
              </div>
            )
          : null}
      </div>
    </section>
  );
}
