import { describe, expect, it } from 'vitest';

import type { ExecutionIntent } from './orchestration';
import {
  type OrchestrationAccount,
  type OrchestrationJob,
  planJobOrchestration,
  resolveStartOutcome,
  selectJobsToStart,
} from './orchestration';

const job = (over: Partial<OrchestrationJob> = {}): OrchestrationJob => ({
  id: 'j1',
  managedAccountId: 'acc-1',
  jobType: 'create_account',
  state: 'assigned',
  startedAt: null,
  ...over,
});

describe('selectJobsToStart', () => {
  it('picks assigned, unstarted jobs that map to an operation', () => {
    const picked = selectJobsToStart([
      job({ id: 'a' }),
      job({ id: 'b', state: 'queued' }), // not assigned
      job({ id: 'c', startedAt: new Date() }), // already started
      job({ id: 'd', jobType: 'transfer_ownership' }), // no platform op
    ]).map(j => j.id);
    expect(picked).toEqual(['a']);
  });
});

describe('planJobOrchestration', () => {
  const accounts = new Map<string, OrchestrationAccount>([
    ['acc-1', { platform: 'tiktok', country: 'US', executionStrategy: null }],
    ['acc-2', { platform: 'ig', country: 'UK', executionStrategy: 'official_api' }],
  ]);

  it('builds intents with resolved strategy + operation + ctx', () => {
    const intents = planJobOrchestration([job()], accounts);
    expect(intents).toHaveLength(1);
    expect(intents[0]!.operation).toBe('create_account');
    expect(intents[0]!.ctx.strategy).toBe('manual'); // null → platform default → manual
    expect(intents[0]!.ctx).toMatchObject({ managedAccountId: 'acc-1', platform: 'tiktok', country: 'US' });
  });

  it('honours the account execution strategy', () => {
    const intents = planJobOrchestration([job({ managedAccountId: 'acc-2' })], accounts);
    expect(intents[0]!.ctx.strategy).toBe('official_api');
  });

  it('skips jobs whose account is missing', () => {
    expect(planJobOrchestration([job({ managedAccountId: 'ghost' })], accounts)).toEqual([]);
  });

  it('threads a publish job content ref into ctx.payload', () => {
    const withContent = planJobOrchestration(
      [job({ jobType: 'publish_post', contentItemId: 'content-9' })],
      accounts,
    );
    expect(withContent[0]!.ctx.payload).toEqual({ contentItemId: 'content-9' });
    // provisioning jobs carry no payload
    expect(planJobOrchestration([job()], accounts)[0]!.ctx.payload).toBeUndefined();
  });
});

describe('resolveStartOutcome', () => {
  const intent: ExecutionIntent = {
    jobId: 'j1',
    jobState: 'assigned',
    operation: 'create_account',
    ctx: { managedAccountId: 'acc-1', platform: 'tiktok', country: 'US', strategy: 'manual' },
  };

  it('pending_operator keeps the job in progress awaiting a human', () => {
    const out = resolveStartOutcome(intent, { outcome: 'pending_operator' });
    expect(out.nextState).toBe('in_progress');
    expect(out.completeAllTasks).toBe(false);
    expect(out.auditAction).toBe('execution_started');
  });

  it('completed submits for QA and marks tasks done', () => {
    const out = resolveStartOutcome(intent, { outcome: 'completed' });
    expect(out.nextState).toBe('peer_review');
    expect(out.completeAllTasks).toBe(true);
    expect(out.auditAction).toBe('execution_completed');
  });

  it('failed fails the job with a reason', () => {
    const out = resolveStartOutcome(intent, { outcome: 'failed', detail: 'api 500' });
    expect(out.nextState).toBe('failed');
    expect(out.failureReason).toBe('api 500');
    expect(out.auditAction).toBe('execution_failed');
  });
});
