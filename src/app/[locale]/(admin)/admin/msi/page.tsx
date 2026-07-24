import { desc, eq } from 'drizzle-orm';
import Link from 'next/link';

import { getDb } from '@/libs/DB';
import {
  humanizeAction,
  stateLabel,
  stateTone,
  toneBadgeClass,
} from '@/lib/msi/display';
import { ACCOUNT_STATES } from '@/lib/msi/lifecycle';
import { rollupCountries, summarizePipeline } from '@/lib/msi/ops-overview';
import { PLATFORM_LABELS } from '@/lib/platforms';
import {
  managedAccountSchema,
  msiActivityLogSchema,
  msiDeviceSchema,
  msiOperatorSchema,
  msiProvisioningOrderSchema,
} from '@/models/Schema';

// Cross-org MSI operations dashboard (docs §8). Server component; the /admin
// route group is gated to NativPost staff in middleware.ts, which is what makes
// this cross-org (all customers') view safe. Read-only.
export const dynamic = 'force-dynamic';

function fmt(d: Date): string {
  return new Date(d).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default async function AdminMsiOpsPage() {
  const db = await getDb();

  const [accounts, operators, devices, pending, recent] = await Promise.all([
    db
      .select({
        country: managedAccountSchema.country,
        lifecycleState: managedAccountSchema.lifecycleState,
      })
      .from(managedAccountSchema),
    db
      .select({
        country: msiOperatorSchema.country,
        capacity: msiOperatorSchema.capacity,
      })
      .from(msiOperatorSchema),
    db
      .select({
        country: msiDeviceSchema.country,
        capacity: msiDeviceSchema.capacity,
      })
      .from(msiDeviceSchema),
    db
      .select({ id: msiProvisioningOrderSchema.id })
      .from(msiProvisioningOrderSchema)
      .where(eq(msiProvisioningOrderSchema.status, 'pending')),
    db
      .select({
        id: msiActivityLogSchema.id,
        action: msiActivityLogSchema.action,
        actorType: msiActivityLogSchema.actorType,
        occurredAt: msiActivityLogSchema.occurredAt,
      })
      .from(msiActivityLogSchema)
      .orderBy(desc(msiActivityLogSchema.occurredAt))
      .limit(15),
  ]);

  const accountsList = await db
    .select({
      id: managedAccountSchema.id,
      displayName: managedAccountSchema.displayName,
      platform: managedAccountSchema.platform,
      country: managedAccountSchema.country,
      lifecycleState: managedAccountSchema.lifecycleState,
    })
    .from(managedAccountSchema)
    .orderBy(desc(managedAccountSchema.updatedAt))
    .limit(50);

  const pipeline = summarizePipeline(accounts.map(a => a.lifecycleState));
  const countries = rollupCountries(accounts, operators, devices);
  const live = pipeline.live + pipeline.active;

  const stats = [
    { label: 'Total accounts', value: accounts.length },
    { label: 'Pending orders', value: pending.length },
    { label: 'In review', value: pipeline.customer_review },
    { label: 'Live', value: live },
  ];

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Managed Social
      </div>
      <h1 className="text-xl font-semibold tracking-tight text-foreground">
        Operations
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Cross-org view of the managed-account provisioning pipeline. Read-only.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map(s => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs text-muted-foreground">{s.label}</div>
            <div className="mt-1 text-2xl font-semibold text-foreground">
              {s.value}
            </div>
          </div>
        ))}
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Pipeline</h2>
        <div className="flex flex-wrap gap-2">
          {ACCOUNT_STATES.map(s => (
            <span
              key={s}
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${toneBadgeClass(stateTone(s))}`}
            >
              {stateLabel(s)}
              :
              {' '}
              {pipeline[s]}
            </span>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Accounts</h2>
        {accountsList.length === 0
          ? (
              <p className="text-sm text-muted-foreground">
                No managed accounts yet.
              </p>
            )
          : (
              <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                {accountsList.map(a => (
                  <Link
                    key={a.id}
                    href={`/admin/msi/${a.id}`}
                    className="flex items-center justify-between gap-3 bg-card px-4 py-3 text-sm transition hover:bg-muted/50"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-foreground">
                        {a.displayName || 'Managed account'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {PLATFORM_LABELS[a.platform] || a.platform}
                        {' · '}
                        {a.country}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-micro font-medium ${toneBadgeClass(stateTone(a.lifecycleState))}`}
                    >
                      {stateLabel(a.lifecycleState)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Countries</h2>
        {countries.length === 0
          ? (
              <p className="text-sm text-muted-foreground">
                No inventory or accounts yet.
              </p>
            )
          : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 font-medium">Country</th>
                      <th className="px-4 py-2 font-medium">Accounts</th>
                      <th className="px-4 py-2 font-medium">Operators (cap)</th>
                      <th className="px-4 py-2 font-medium">Devices (cap)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {countries.map(c => (
                      <tr key={c.country} className="border-t border-border">
                        <td className="px-4 py-2 font-medium text-foreground">
                          {c.country}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {c.accounts}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {c.operators}
                          {' '}
                          (
                          {c.operatorCapacity}
                          )
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {c.devices}
                          {' '}
                          (
                          {c.deviceCapacity}
                          )
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          Recent activity
        </h2>
        {recent.length === 0
          ? (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            )
          : (
              <ul className="space-y-2">
                {recent.map(e => (
                  <li
                    key={e.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-2 text-sm"
                  >
                    <span className="text-foreground">
                      {humanizeAction(e.action)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {e.actorType}
                      {' · '}
                      {fmt(e.occurredAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
      </section>
    </div>
  );
}
