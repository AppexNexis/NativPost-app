// Credential custody state machine (docs §9.1). Source of truth for the
// `msi_credential.custody_state` column. Off-boarding is first-class: the only
// path to `released` runs through `transfer_requested` and requires dual
// authorization + credential rotation.

import type { Guard } from './state-machine';
import { createMachine } from './state-machine';

export const CUSTODY_STATES = [
  'provisioning',
  'nativpost_operating',
  'transfer_requested',
  'released',
] as const;

export type CustodyState = (typeof CUSTODY_STATES)[number];

export type CustodyTransitionContext = {
  customerAuthorized?: boolean;
  opsAdminAuthorized?: boolean;
  credentialRotated?: boolean;
};

const requireDualAuthAndRotation: Guard<CustodyTransitionContext> = (ctx) => {
  if (!ctx.customerAuthorized) {
    return 'customer has not authorized the transfer';
  }
  if (!ctx.opsAdminAuthorized) {
    return 'an ops admin has not co-authorized the transfer';
  }
  if (!ctx.credentialRotated) {
    return 'credentials have not been rotated to customer control';
  }
  return true;
};

export const credentialCustody = createMachine<
  CustodyState,
  CustodyTransitionContext
>({
  states: CUSTODY_STATES,
  initial: 'provisioning',
  terminal: ['released'],
  transitions: {
    // released here = order cancelled before we ever operated the account.
    provisioning: { nativpost_operating: true, released: true },
    nativpost_operating: { transfer_requested: true },
    // nativpost_operating = customer cancelled the transfer and we keep running it.
    transfer_requested: {
      released: requireDualAuthAndRotation,
      nativpost_operating: true,
    },
    released: {},
  },
});

export function transitionCustody(
  from: CustodyState,
  to: CustodyState,
  ctx: CustodyTransitionContext = {},
): CustodyState {
  return credentialCustody.transition(from, to, ctx);
}

export const canTransitionCustody = (
  from: CustodyState,
  to: CustodyState,
): boolean => credentialCustody.can(from, to);

export const isCustodyTerminal = (state: CustodyState): boolean =>
  credentialCustody.isTerminal(state);
