import type { Guide } from '../types';

export const campaigns: Guide = {
  slug: 'campaigns',
  title: 'Campaigns — planning a stretch at once',
  summary:
    'Blitz handles today. A campaign plans weeks in one pass: set the cadence, review everything, then '
    + 'launch it as a block.',
  category: 'planning',
  order: 1,
  readingMinutes: 4,
  video: { src: 'nativpost/learn/guide-04-campaigns', duration: '1:15' },
  readNext: ['blitz-daily-queue', 'managed-infrastructure'],
  sections: [
    {
      id: 'blitz-vs-campaigns',
      heading: 'Blitz handles today. Campaigns plan a stretch.',
      blocks: [
        {
          type: 'p',
          text: 'They are the same generation engine pointed at different horizons. Blitz gives you a daily queue to judge. A campaign writes a whole run — a launch week, a month of a theme — in one pass, so you review it as a body of work rather than a post at a time.',
        },
      ],
    },
    {
      id: 'the-wizard',
      heading: 'The nine-step wizard',
      blocks: [
        {
          type: 'p',
          text: '**New Campaign** opens a nine-step wizard. It looks long — most steps take seconds. In order, you set:',
        },
        {
          type: 'steps',
          items: [
            { title: 'What it\'s about', text: 'The subject of the campaign.' },
            { title: 'Content angles', text: 'Balance the themes it draws on.' },
            { title: 'Voice', text: 'How it should sound, within your brand profile.' },
            { title: 'Visuals', text: 'Where the imagery comes from — your media, the template library, or AI influencers.' },
            { title: 'Accounts', text: 'Which connected accounts get posted to.' },
            { title: 'Cadence', text: 'Posts per day, and how many weeks it runs. This is the one that matters.' },
          ],
        },
        {
          type: 'callout',
          tone: 'tip',
          text: 'Cadence sets the volume of everything downstream. Two posts a day for four weeks is 56 posts to review — decide that deliberately rather than accepting the default.',
        },
      ],
    },
    {
      id: 'generation',
      heading: 'Generation runs in the background',
      blocks: [
        {
          type: 'p',
          text: '**Generate** runs in the background — you can leave the page. The campaign card reports progress as posts are written and media renders. Large campaigns are produced in chunks, so a long run continues even if a single step is interrupted.',
        },
      ],
    },
    {
      id: 'review-then-launch',
      heading: 'Review comes before scheduling',
      blocks: [
        {
          type: 'p',
          text: 'When generation finishes you **review every post** — before a single one is scheduled. Edit the copy, swap media, or reject what doesn\'t work.',
        },
        {
          type: 'p',
          text: '**Launch** schedules the lot. The campaign flips to active and its calendar fills in. **Nothing ships until you launch.**',
        },
      ],
    },
    {
      id: 'tiktok-note',
      heading: 'A note on TikTok',
      blocks: [
        {
          type: 'p',
          text: 'A campaign pins the specific accounts it will publish to when it is created. If you disconnect and reconnect a channel afterwards, that creates a new connection — and the campaign is still pointing at the old one.',
        },
        {
          type: 'p',
          text: 'TikTok hits this more than the others because its tokens are short-lived and it gets reconnected more often. If one platform in a campaign stops publishing while the rest keep working, a stale connection is the first thing to check.',
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
            'Cadence sets the volume.',
            'Generation runs in the background.',
            'Review comes before scheduling.',
            'Nothing ships until you launch.',
          ],
        },
      ],
    },
  ],
};
