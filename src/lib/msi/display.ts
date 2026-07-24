// Presentation helpers for the customer-facing Infrastructure surfaces
// (docs §13). Pure — maps lifecycle states + activity-log actions to labels,
// tones, and the 4-stage customer progress bar. No `db`/`Env`, so it is safe
// to import into client components.

import type { AccountState } from './lifecycle';

export type StateTone = 'neutral' | 'progress' | 'review' | 'live' | 'warn' | 'danger';

/** The 4 customer-facing stages shown as a progress bar. */
export const CUSTOMER_STAGES = ['Configure', 'Building', 'Review', 'Live'] as const;

export const ACCOUNT_STATE_META: Record<
  AccountState,
  { label: string; tone: StateTone; stageIndex: number }
> = {
  ordered: { label: 'Ordered', tone: 'neutral', stageIndex: 0 },
  provisioning: { label: 'Provisioning', tone: 'progress', stageIndex: 1 },
  brand_setup: { label: 'Brand setup', tone: 'progress', stageIndex: 1 },
  building: { label: 'Building', tone: 'progress', stageIndex: 1 },
  qa_review: { label: 'Quality review', tone: 'progress', stageIndex: 1 },
  customer_review: { label: 'Ready for review', tone: 'review', stageIndex: 2 },
  revisions: { label: 'Applying changes', tone: 'progress', stageIndex: 1 },
  live: { label: 'Live', tone: 'live', stageIndex: 3 },
  active: { label: 'Active', tone: 'live', stageIndex: 3 },
  paused: { label: 'Paused', tone: 'warn', stageIndex: 3 },
  archived: { label: 'Archived', tone: 'neutral', stageIndex: 3 },
  failed: { label: 'Needs attention', tone: 'danger', stageIndex: 1 },
};

function meta(state: string) {
  return ACCOUNT_STATE_META[state as AccountState];
}

export function stateLabel(state: string): string {
  return meta(state)?.label ?? state;
}

export function stateTone(state: string): StateTone {
  return meta(state)?.tone ?? 'neutral';
}

/** Index (0..3) into CUSTOMER_STAGES for the progress bar. */
export function customerStageIndex(state: string): number {
  return meta(state)?.stageIndex ?? 0;
}

/** Tailwind classes for a state badge, keyed by tone. */
export function toneBadgeClass(tone: StateTone): string {
  switch (tone) {
    case 'progress':
      return 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400';
    case 'review':
      return 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400';
    case 'live':
      return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400';
    case 'warn':
      return 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400';
    case 'danger':
      return 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400';
    case 'neutral':
    default:
      return 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400';
  }
}

/** Human-readable label for an activity-log action (docs §13.2 timeline). */
const ACTION_LABELS: Record<string, string> = {
  account_ordered: 'Order received',
  authorization_signed: 'Authorization signed',
  payment_received: 'Payment received',
  operator_assigned: 'Operator assigned',
  profile_created: 'Profile created',
  bio_added: 'Bio added',
  first_posts_prepared: 'First posts prepared',
  qa_passed: 'Quality check passed',
  review_started: 'Ready for your review',
  changes_requested: 'Changes requested',
  changes_completed: 'Changes completed',
  went_live: 'Account went live',
  first_post_published: 'First post published',
  sla_breach: 'Delivery running late — team notified',
  execution_started: 'Work started — in progress',
  execution_completed: 'Work completed',
  execution_failed: 'A step failed — team notified',
};

export function humanizeAction(action: string): string {
  if (ACTION_LABELS[action]) {
    return ACTION_LABELS[action];
  }
  // Fallback: "some_action_name" → "Some action name".
  const spaced = action.replace(/_/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
