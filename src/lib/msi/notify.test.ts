import { describe, expect, it } from 'vitest';

import {
  buildManagedAccountEmailContent,
  buildManagedAccountNotification,
} from './notify';

describe('buildManagedAccountNotification', () => {
  it('builds a review-ready notification linked to the account', () => {
    const n = buildManagedAccountNotification({
      orgId: 'org-1',
      event: 'review_ready',
      accountId: 'acc-1',
      handle: '@demo',
    });
    expect(n).toMatchObject({
      orgId: 'org-1',
      category: 'infrastructure',
      type: 'info',
      title: '@demo is ready for review',
      actionUrl: '/dashboard/infrastructure/acc-1',
      actionLabel: 'Review account',
    });
  });

  it('builds a went-live notification', () => {
    const n = buildManagedAccountNotification({
      orgId: 'o',
      event: 'went_live',
      accountId: 'a',
      handle: '@x',
    });
    expect(n.type).toBe('success');
    expect(n.title).toBe('@x is live');
  });
});

describe('buildManagedAccountEmailContent', () => {
  it('builds review-ready + went-live emails with the account link', () => {
    const review = buildManagedAccountEmailContent({
      event: 'review_ready',
      handle: '@demo',
      url: 'https://app/x',
    });
    expect(review.subject).toBe('@demo is ready for your review');
    expect(review.text).toContain('https://app/x');

    const live = buildManagedAccountEmailContent({
      event: 'went_live',
      handle: '@demo',
      url: 'https://app/x',
    });
    expect(live.subject).toBe('@demo is live');
  });
});
