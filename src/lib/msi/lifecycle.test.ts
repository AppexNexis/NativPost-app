import { describe, expect, it } from 'vitest';

import {
  ACCOUNT_STATES,
  accountLifecycle,
  canTransitionAccount,
  isAccountTerminal,
  transitionAccount,
} from './lifecycle';
import { GuardFailedError, InvalidTransitionError } from './state-machine';

const ALL_TRUE = {
  grantActive: true,
  paymentConfirmed: true,
  capacityReserved: true,
  allTasksComplete: true,
  qaPassed: true,
  customerApproved: true,
};

describe('account lifecycle', () => {
  it('starts at ordered', () => {
    expect(accountLifecycle.initial).toBe('ordered');
  });

  it('archived is the only terminal state and has no outgoing edges', () => {
    expect(isAccountTerminal('archived')).toBe(true);
    expect(accountLifecycle.nextStates('archived')).toEqual([]);
    for (const to of ACCOUNT_STATES) {
      expect(canTransitionAccount('archived', to)).toBe(false);
    }
  });

  it('walks the happy path ordered → active', () => {
    let s = accountLifecycle.initial;
    for (const to of [
      'provisioning',
      'brand_setup',
      'building',
      'qa_review',
      'customer_review',
      'live',
      'active',
    ] as const) {
      s = transitionAccount(s, to, ALL_TRUE);
    }
    expect(s).toBe('active');
  });

  it('blocks provisioning until grant + payment + capacity are all satisfied', () => {
    expect(() =>
      transitionAccount('ordered', 'provisioning', { grantActive: false }),
    ).toThrow(GuardFailedError);
    expect(() =>
      transitionAccount('ordered', 'provisioning', {
        grantActive: true,
        paymentConfirmed: false,
      }),
    ).toThrow(/payment/);
    expect(() =>
      transitionAccount('ordered', 'provisioning', {
        grantActive: true,
        paymentConfirmed: true,
        capacityReserved: false,
      }),
    ).toThrow(/capacity/);
    expect(transitionAccount('ordered', 'provisioning', ALL_TRUE)).toBe(
      'provisioning',
    );
  });

  it('blocks building → qa_review until all tasks complete', () => {
    expect(() =>
      transitionAccount('building', 'qa_review', { allTasksComplete: false }),
    ).toThrow(/tasks/);
    expect(
      transitionAccount('building', 'qa_review', { allTasksComplete: true }),
    ).toBe('qa_review');
  });

  it('blocks qa_review → customer_review until QA passes', () => {
    expect(() =>
      transitionAccount('qa_review', 'customer_review', { qaPassed: false }),
    ).toThrow(GuardFailedError);
    expect(
      transitionAccount('qa_review', 'customer_review', { qaPassed: true }),
    ).toBe('customer_review');
  });

  it('lets QA send a build back to building', () => {
    expect(transitionAccount('qa_review', 'building')).toBe('building');
  });

  it('blocks customer_review → live until the customer approves', () => {
    expect(() =>
      transitionAccount('customer_review', 'live', { customerApproved: false }),
    ).toThrow(GuardFailedError);
    expect(
      transitionAccount('customer_review', 'live', { customerApproved: true }),
    ).toBe('live');
  });

  it('routes change requests through revisions → building', () => {
    expect(transitionAccount('customer_review', 'revisions')).toBe('revisions');
    expect(transitionAccount('revisions', 'building')).toBe('building');
  });

  it('recovers a failed account into the pipeline or archives it', () => {
    expect(canTransitionAccount('failed', 'provisioning')).toBe(true);
    expect(canTransitionAccount('failed', 'building')).toBe(true);
    expect(canTransitionAccount('failed', 'archived')).toBe(true);
  });

  it('can fail from every operational state but not from paused/archived', () => {
    for (const from of [
      'ordered',
      'provisioning',
      'brand_setup',
      'building',
      'qa_review',
      'customer_review',
      'revisions',
      'live',
      'active',
    ] as const) {
      expect(canTransitionAccount(from, 'failed')).toBe(true);
    }
    expect(canTransitionAccount('paused', 'failed')).toBe(false);
    expect(canTransitionAccount('archived', 'failed')).toBe(false);
  });

  it('rejects undefined transitions with InvalidTransitionError', () => {
    expect(() => transitionAccount('ordered', 'live', ALL_TRUE)).toThrow(
      InvalidTransitionError,
    );
    expect(() => transitionAccount('active', 'ordered', ALL_TRUE)).toThrow(
      InvalidTransitionError,
    );
    expect(canTransitionAccount('ordered', 'live')).toBe(false);
  });
});
