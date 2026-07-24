import { describe, expect, it } from 'vitest';

import {
  canTransitionJob,
  isJobTerminal,
  JOB_STATES,
  JOB_TYPES,
  jobWorkflow,
  transitionJob,
} from './job-workflow';
import { GuardFailedError, InvalidTransitionError } from './state-machine';

describe('job workflow', () => {
  it('starts queued', () => {
    expect(jobWorkflow.initial).toBe('queued');
  });

  it('has completed and cancelled as terminal states', () => {
    expect(isJobTerminal('completed')).toBe(true);
    expect(isJobTerminal('cancelled')).toBe(true);
    for (const to of JOB_STATES) {
      expect(canTransitionJob('completed', to)).toBe(false);
      expect(canTransitionJob('cancelled', to)).toBe(false);
    }
  });

  it('exposes the full job taxonomy', () => {
    expect(JOB_TYPES).toContain('create_account');
    expect(JOB_TYPES).toContain('transfer_ownership');
    expect(JOB_TYPES).toContain('appeal_restriction');
  });

  it('walks the happy path queued → completed through the QA pipeline', () => {
    let s = jobWorkflow.initial;
    s = transitionJob(s, 'assigned', { hasOperator: true, hasDevice: true });
    s = transitionJob(s, 'in_progress');
    s = transitionJob(s, 'peer_review', { evidenceAttached: true });
    s = transitionJob(s, 'qa', { reviewerApproved: true });
    s = transitionJob(s, 'completed', { qaApproved: true });
    expect(s).toBe('completed');
  });

  it('blocks assignment without an operator and a device', () => {
    expect(() =>
      transitionJob('queued', 'assigned', { hasOperator: true, hasDevice: false }),
    ).toThrow(/device/);
    expect(() =>
      transitionJob('queued', 'assigned', { hasOperator: false, hasDevice: true }),
    ).toThrow(/operator/);
    expect(
      transitionJob('queued', 'assigned', { hasOperator: true, hasDevice: true }),
    ).toBe('assigned');
  });

  it('blocks submission to peer_review without evidence', () => {
    expect(() =>
      transitionJob('in_progress', 'peer_review', { evidenceAttached: false }),
    ).toThrow(GuardFailedError);
  });

  it('requires reviewer approval before QA and QA approval before completion', () => {
    expect(() =>
      transitionJob('peer_review', 'qa', { reviewerApproved: false }),
    ).toThrow(/reviewer/);
    expect(() =>
      transitionJob('qa', 'completed', { qaApproved: false }),
    ).toThrow(/QA/);
  });

  it('loops rejected work back to in_progress at both gates', () => {
    expect(transitionJob('peer_review', 'in_progress')).toBe('in_progress');
    expect(transitionJob('qa', 'in_progress')).toBe('in_progress');
  });

  it('retries a failed job only while under the attempt limit', () => {
    expect(transitionJob('failed', 'queued', { attempts: 1, maxAttempts: 3 })).toBe(
      'queued',
    );
    expect(() =>
      transitionJob('failed', 'queued', { attempts: 3, maxAttempts: 3 }),
    ).toThrow(/retry limit/);
  });

  it('supports block/unblock while in progress', () => {
    expect(transitionJob('in_progress', 'blocked')).toBe('blocked');
    expect(transitionJob('blocked', 'in_progress')).toBe('in_progress');
  });

  it('can cancel from any non-terminal state', () => {
    for (const from of [
      'queued',
      'assigned',
      'in_progress',
      'blocked',
      'peer_review',
      'qa',
      'failed',
    ] as const) {
      expect(canTransitionJob(from, 'cancelled')).toBe(true);
    }
  });

  it('rejects undefined transitions with InvalidTransitionError', () => {
    expect(() => transitionJob('queued', 'completed')).toThrow(
      InvalidTransitionError,
    );
    expect(() => transitionJob('blocked', 'qa')).toThrow(InvalidTransitionError);
    expect(canTransitionJob('queued', 'completed')).toBe(false);
  });
});
