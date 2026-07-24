// Audit / activity event builder (docs §7.4). The msi_activity_log is
// APPEND-ONLY — build events here, insert them, never update or delete. Pure:
// no `db` import so this stays trivially testable; the insert happens at the
// call site (e.g. src/lib/msi/provisioning.ts).

export const ACTOR_TYPES = ['system', 'operator', 'customer'] as const;

export type ActorType = (typeof ACTOR_TYPES)[number];

export type ActivityInput = {
  managedAccountId?: string | null;
  jobId?: string | null;
  actorType: ActorType;
  actorId?: string | null;
  action: string;
  detail?: Record<string, unknown>;
  occurredAt?: Date;
};

/** Row-shaped event ready to insert into msi_activity_log. */
export type ActivityEvent = {
  managedAccountId: string | null;
  jobId: string | null;
  actorType: ActorType;
  actorId: string | null;
  action: string;
  detail: Record<string, unknown>;
  occurredAt: Date;
};

export function buildActivityEvent(input: ActivityInput): ActivityEvent {
  if (!ACTOR_TYPES.includes(input.actorType)) {
    throw new Error(`invalid activity actorType: ${input.actorType}`);
  }
  if (!input.action.trim()) {
    throw new Error('activity action is required');
  }
  return {
    managedAccountId: input.managedAccountId ?? null,
    jobId: input.jobId ?? null,
    actorType: input.actorType,
    actorId: input.actorId ?? null,
    action: input.action,
    detail: input.detail ?? {},
    occurredAt: input.occurredAt ?? new Date(),
  };
}
