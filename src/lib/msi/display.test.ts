import { describe, expect, it } from 'vitest';

import { ACCOUNT_STATES } from './lifecycle';
import {
  ACCOUNT_STATE_META,
  customerStageIndex,
  CUSTOMER_STAGES,
  humanizeAction,
  stateLabel,
  stateTone,
} from './display';

describe('msi display helpers', () => {
  it('has metadata for every lifecycle state', () => {
    for (const state of ACCOUNT_STATES) {
      expect(ACCOUNT_STATE_META[state]).toBeDefined();
      expect(ACCOUNT_STATE_META[state].label.length).toBeGreaterThan(0);
    }
  });

  it('keeps every stage index within the customer stage bar', () => {
    for (const state of ACCOUNT_STATES) {
      const idx = customerStageIndex(state);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(CUSTOMER_STAGES.length);
    }
  });

  it('falls back gracefully for unknown states', () => {
    expect(stateLabel('mystery')).toBe('mystery');
    expect(stateTone('mystery')).toBe('neutral');
    expect(customerStageIndex('mystery')).toBe(0);
  });

  it('maps known actions and humanizes unknown ones', () => {
    expect(humanizeAction('account_ordered')).toBe('Order received');
    expect(humanizeAction('went_live')).toBe('Account went live');
    expect(humanizeAction('some_new_action')).toBe('Some new action');
  });
});
