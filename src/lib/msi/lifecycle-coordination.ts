// Account-lifecycle coordination (docs §5). When a provisioning job clears QA,
// the account is walked forward to `customer_review`. Pure — composes the
// (tested) account state machine; the guarded steps get the completion context.

import type { AccountState, AccountTransitionContext } from './lifecycle';
import { transitionAccount } from './lifecycle';

/**
 * The states to step through to reach `customer_review` from wherever the
 * account currently is during provisioning. Empty if already there / N/A.
 */
export function pathToCustomerReview(from: string): AccountState[] {
  switch (from) {
    case 'provisioning':
      return ['brand_setup', 'building', 'qa_review', 'customer_review'];
    case 'brand_setup':
      return ['building', 'qa_review', 'customer_review'];
    case 'building':
      return ['qa_review', 'customer_review'];
    case 'revisions':
      return ['building', 'qa_review', 'customer_review'];
    case 'qa_review':
      return ['customer_review'];
    default:
      return [];
  }
}

/** Apply each transition in order (validated), returning the final state. */
export function advanceAccountThrough(
  from: AccountState,
  targets: AccountState[],
  ctx: AccountTransitionContext = {},
): AccountState {
  let state = from;
  for (const target of targets) {
    state = transitionAccount(state, target, ctx);
  }
  return state;
}
