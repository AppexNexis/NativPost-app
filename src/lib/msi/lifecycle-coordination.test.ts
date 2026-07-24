import { describe, expect, it } from 'vitest';

import {
  advanceAccountThrough,
  pathToCustomerReview,
} from './lifecycle-coordination';

describe('pathToCustomerReview', () => {
  it('walks from provisioning all the way to customer_review', () => {
    expect(pathToCustomerReview('provisioning')).toEqual([
      'brand_setup',
      'building',
      'qa_review',
      'customer_review',
    ]);
  });

  it('handles mid-provisioning and revisions', () => {
    expect(pathToCustomerReview('building')).toEqual(['qa_review', 'customer_review']);
    expect(pathToCustomerReview('revisions')).toEqual([
      'building',
      'qa_review',
      'customer_review',
    ]);
  });

  it('is a no-op for states with no path', () => {
    expect(pathToCustomerReview('live')).toEqual([]);
    expect(pathToCustomerReview('customer_review')).toEqual([]);
  });
});

describe('advanceAccountThrough', () => {
  it('applies each step and returns the final state', () => {
    const final = advanceAccountThrough(
      'provisioning',
      pathToCustomerReview('provisioning'),
      { allTasksComplete: true, qaPassed: true },
    );
    expect(final).toBe('customer_review');
  });

  it('throws if a guarded step is not satisfied', () => {
    // building → qa_review needs allTasksComplete
    expect(() =>
      advanceAccountThrough('building', ['qa_review'], { allTasksComplete: false }),
    ).toThrow();
  });
});
