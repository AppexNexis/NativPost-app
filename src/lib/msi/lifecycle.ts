// Managed account lifecycle state machine (docs §5). This module is the
// source of truth for the `managed_account.lifecycle_state` column.

import type { Guard } from './state-machine';
import { createMachine } from './state-machine';

export const ACCOUNT_STATES = [
  'ordered',
  'provisioning',
  'brand_setup',
  'building',
  'qa_review',
  'customer_review',
  'revisions',
  'live',
  'active',
  'paused',
  'archived',
  'failed',
] as const;

export type AccountState = (typeof ACCOUNT_STATES)[number];

/** Guard inputs for lifecycle transitions. All optional; missing = falsy. */
export type AccountTransitionContext = {
  grantActive?: boolean;
  paymentConfirmed?: boolean;
  capacityReserved?: boolean;
  allTasksComplete?: boolean;
  qaPassed?: boolean;
  customerApproved?: boolean;
};

const requireProvisioningPrereqs: Guard<AccountTransitionContext> = (ctx) => {
  if (!ctx.grantActive) {
    return 'authorization grant is not active';
  }
  if (!ctx.paymentConfirmed) {
    return 'payment is not confirmed';
  }
  if (!ctx.capacityReserved) {
    return 'capacity is not reserved';
  }
  return true;
};

const requireTasksComplete: Guard<AccountTransitionContext> = ctx =>
  ctx.allTasksComplete ? true : 'not all build tasks are complete';

const requireQaPassed: Guard<AccountTransitionContext> = ctx =>
  ctx.qaPassed ? true : 'QA has not passed';

const requireCustomerApproved: Guard<AccountTransitionContext> = ctx =>
  ctx.customerApproved ? true : 'customer has not approved';

export const accountLifecycle = createMachine<
  AccountState,
  AccountTransitionContext
>({
  states: ACCOUNT_STATES,
  initial: 'ordered',
  terminal: ['archived'],
  transitions: {
    ordered: { provisioning: requireProvisioningPrereqs, failed: true },
    provisioning: { brand_setup: true, failed: true },
    brand_setup: { building: true, failed: true },
    building: { qa_review: requireTasksComplete, failed: true },
    // qa_review → building = QA sent the build back for rework.
    qa_review: { customer_review: requireQaPassed, building: true, failed: true },
    customer_review: {
      live: requireCustomerApproved,
      revisions: true,
      failed: true,
    },
    revisions: { building: true, failed: true },
    live: { active: true, archived: true, failed: true },
    active: { paused: true, archived: true, failed: true },
    paused: { active: true, archived: true },
    // A failed account can be recovered into the pipeline or terminated.
    failed: { provisioning: true, building: true, archived: true },
    archived: {},
  },
});

export function transitionAccount(
  from: AccountState,
  to: AccountState,
  ctx: AccountTransitionContext = {},
): AccountState {
  return accountLifecycle.transition(from, to, ctx);
}

export const canTransitionAccount = (
  from: AccountState,
  to: AccountState,
): boolean => accountLifecycle.can(from, to);

export const isAccountTerminal = (state: AccountState): boolean =>
  accountLifecycle.isTerminal(state);
