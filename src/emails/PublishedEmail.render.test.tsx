import { render } from '@react-email/components';
import { describe, expect, it } from 'vitest';

import PublishedEmail from './PublishedEmail';

describe('PublishedEmail', () => {
  it('names the accounts and links to each live post', async () => {
    const html = await render(
      PublishedEmail({
        brandName: 'Acme Co',
        platforms: 'tiktok, instagram',
        caption: 'Hello world',
        targets: [
          { platform: 'tiktok', accountName: '@acme', permalink: 'https://tiktok.com/@acme/video/1' },
          { platform: 'instagram', accountName: 'acme.hq', permalink: null },
        ],
      }),
    );

    expect(html).toContain('@acme');
    expect(html).toContain('acme.hq');
    expect(html).toContain('https://tiktok.com/@acme/video/1');
    // Channel labels are humanised, not raw platform keys.
    expect(html).toContain('TikTok');
    expect(html).toContain('Instagram');
    // The org id must never reach an email.
    expect(html).not.toContain('org_');
  });

  it('falls back to the channel list when no targets are supplied', async () => {
    const html = await render(
      PublishedEmail({
        brandName: 'Acme Co',
        platforms: 'linkedin',
        caption: 'Hello world',
      }),
    );

    // Humanised, never the raw internal key.
    expect(html).toContain('LinkedIn');
    expect(html).not.toContain('Published to');
  });
});
