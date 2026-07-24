import { describe, expect, it } from 'vitest';

import {
  canTransitionCustody,
  credentialCustody,
  CUSTODY_STATES,
  isCustodyTerminal,
  transitionCustody,
} from './custody';
import { GuardFailedError, InvalidTransitionError } from './state-machine';

const DUAL_AUTH = {
  customerAuthorized: true,
  opsAdminAuthorized: true,
  credentialRotated: true,
};

describe('credential custody', () => {
  it('starts in provisioning; released is terminal', () => {
    expect(credentialCustody.initial).toBe('provisioning');
    expect(isCustodyTerminal('released')).toBe(true);
    for (const to of CUSTODY_STATES) {
      expect(canTransitionCustody('released', to)).toBe(false);
    }
  });

  it('walks the off-boarding path operating → transfer_requested → released', () => {
    let s = transitionCustody('provisioning', 'nativpost_operating');
    s = transitionCustody(s, 'transfer_requested');
    s = transitionCustody(s, 'released', DUAL_AUTH);
    expect(s).toBe('released');
  });

  it('requires customer + ops-admin authorization AND rotation to release', () => {
    expect(() =>
      transitionCustody('transfer_requested', 'released', {
        ...DUAL_AUTH,
        customerAuthorized: false,
      }),
    ).toThrow(/customer/);
    expect(() =>
      transitionCustody('transfer_requested', 'released', {
        ...DUAL_AUTH,
        opsAdminAuthorized: false,
      }),
    ).toThrow(/ops admin/);
    expect(() =>
      transitionCustody('transfer_requested', 'released', {
        ...DUAL_AUTH,
        credentialRotated: false,
      }),
    ).toThrow(GuardFailedError);
  });

  it('lets a customer cancel a transfer (back to operating)', () => {
    expect(transitionCustody('transfer_requested', 'nativpost_operating')).toBe(
      'nativpost_operating',
    );
  });

  it('allows release straight from provisioning (order cancelled early)', () => {
    expect(transitionCustody('provisioning', 'released')).toBe('released');
  });

  it('forbids skipping the transfer request from operating', () => {
    expect(() =>
      transitionCustody('nativpost_operating', 'released', DUAL_AUTH),
    ).toThrow(InvalidTransitionError);
    expect(canTransitionCustody('nativpost_operating', 'released')).toBe(false);
  });
});
