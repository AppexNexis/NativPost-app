import type { Guide } from '../types';

export const managedInfrastructure: Guide = {
  slug: 'managed-infrastructure',
  title: 'Infrastructure — managed social accounts',
  summary:
    'Real accounts, created and run for you by local teams on real devices. What you own, what it costs, '
    + 'and how one goes live.',
  category: 'accounts',
  order: 2,
  readingMinutes: 4,
  video: { src: 'nativpost/learn/guide-05-infrastructure', duration: '1:15' },
  readNext: ['connect-your-channels', 'campaigns'],
  sections: [
    {
      id: 'what-it-is',
      heading: 'What it is — and what it isn\'t',
      blocks: [
        {
          type: 'p',
          text: 'Infrastructure is **managed social accounts** — real accounts, run for you. **Not bought, and not automated.** They are created and run by local teams, on real devices, in the market you are targeting.',
        },
        {
          type: 'callout',
          tone: 'info',
          text: 'This matters for account survival. Bought accounts and emulator farms get detected and removed. An account created and warmed by a person on a real device in the right country behaves like what it is.',
        },
      ],
    },
    {
      id: 'ownership',
      heading: 'You own them',
      blocks: [
        {
          type: 'p',
          text: '**You own every account, and its credentials. You can ask for them at any time.** There is no lock-in: if you stop using NativPost, the accounts go with you.',
        },
      ],
    },
    {
      id: 'pricing',
      heading: 'What it costs',
      blocks: [
        {
          type: 'table',
          head: ['', 'Price'],
          rows: [
            ['Per account, per month', '$80 — covers creation, warm-up, hosting and management'],
            ['Publishing', '$1.50 per post'],
          ],
        },
      ],
    },
    {
      id: 'lifecycle',
      heading: 'How an account goes live',
      blocks: [
        {
          type: 'steps',
          items: [
            { title: 'Configure', text: 'Set the country, the platform, the niche, and the handles you want.' },
            { title: 'Creation and warm-up', text: 'It is created and warmed up in your niche — usually ready for your review within a couple of days.' },
            { title: 'Review', text: 'You review the profile and either request changes or approve it.' },
            { title: 'Live', text: 'Once approved it goes live, and joins your calendar like any connected account.' },
          ],
        },
        {
          type: 'p',
          text: 'From that point it behaves exactly like a channel you connected yourself — campaigns and Blitz can target it, and it appears in analytics alongside the rest.',
        },
      ],
    },
    {
      id: 'recap',
      heading: 'The short version',
      blocks: [
        {
          type: 'list',
          items: [
            'You own them, credentials included.',
            'Real people run them, on real devices.',
            'Warm-up takes a couple of days.',
            'Nothing goes live until you approve it.',
          ],
        },
      ],
    },
  ],
};
