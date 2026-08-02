/**
 * Not a test so much as a preview builder: renders every template to
 * disk so the actual HTML can be opened in a browser and eyeballed.
 * Kept out of the default run via the `preview` tag.
 */
import { render } from '@react-email/components';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'vitest';

import ApprovalEmail from './ApprovalEmail';
import PublishedEmail from './PublishedEmail';
import ScheduledEmail from './ScheduledEmail';
import WelcomeEmail from './WelcomeEmail';

const OUT = process.env.EMAIL_PREVIEW_DIR ?? join(process.cwd(), '.email-preview');

describe('email previews', () => {
  it('renders every template to disk', async () => {
    mkdirSync(OUT, { recursive: true });

    const pages: Array<[string, React.ReactElement]> = [
      ['welcome', WelcomeEmail({ userName: 'Wilson', brandName: 'Steibs Floral' })],
      ['published', PublishedEmail({
        brandName: 'Steibs Floral',
        platforms: 'tiktok, instagram, youtube',
        caption: 'Three arrangements that sell out every single weekend — and the one thing they all have in common.',
        targets: [
          { platform: 'tiktok', accountName: '@steibsfloral', permalink: 'https://www.tiktok.com/@steibsfloral/video/123' },
          { platform: 'instagram', accountName: 'steibs.floral', permalink: 'https://instagram.com/p/abc' },
          { platform: 'youtube', accountName: 'Steibs Floral', permalink: null },
        ],
      })],
      ['scheduled', ScheduledEmail({
        brandName: 'Steibs Floral',
        platforms: 'tiktok, instagram',
        caption: 'Behind the scenes on our Saturday market prep.',
        scheduledFor: 'Tomorrow at 9:00 AM',
      })],
      ['approval', ApprovalEmail({ brandName: 'Steibs Floral', contentCount: 12 })],
    ];

    const rendered = await Promise.all(
      pages.map(async ([name, el]) => [name, await render(el)] as const),
    );

    for (const [name, html] of rendered) {
      writeFileSync(join(OUT, `${name}.html`), html, 'utf-8');
    }

    // One index so all four can be compared side by side.
    writeFileSync(
      join(OUT, 'index.html'),
      `<h1 style="font-family:sans-serif">NativPost email templates</h1>${
        rendered.map(([name, html]) =>
          `<h2 style="font-family:sans-serif;margin:24px 0 8px">${name}</h2>`
          + `<iframe srcdoc="${html.replace(/"/g, '&quot;')}" style="width:100%;max-width:620px;height:900px;border:1px solid #ddd"></iframe>`,
        ).join('')}`,
      'utf-8',
    );
  });
});
