import type { Guide } from '../types';

export const getStarted: Guide = {
  slug: 'get-started',
  title: 'A complete walkthrough of NativPost',
  summary:
    'New here? This covers the whole path — sign-up, your workspace, letting NativPost read your site, '
    + 'and the dashboard you land on.',
  category: 'start-here',
  order: 1,
  featured: true,
  readingMinutes: 5,
  video: { src: 'nativpost/learn/guide-01-get-started', duration: '1:15' },
  readNext: ['connect-your-channels', 'blitz-daily-queue'],
  sections: [
    {
      id: 'workspaces',
      heading: 'One workspace per brand',
      blocks: [
        {
          type: 'p',
          text: 'Create your account with email or Google, then name your workspace. **A workspace is one brand** — its own brand voice, its own connected channels, its own content. If you run several brands, or you\'re an agency with clients, give each one its own workspace. You can add more at any time.',
        },
        {
          type: 'callout',
          tone: 'tip',
          text: 'Not sure yet? Start with one. Splitting later is easy; merging two workspaces is not.',
        },
      ],
    },
    {
      id: 'paste-your-site',
      heading: 'Paste your site — this is the step that matters',
      blocks: [
        {
          type: 'p',
          text: 'Setup asks for your website, and NativPost reads it: your voice, your audience, and what you sell. It comes back with a **brand profile** and a set of **content angles** — the recurring themes it will write about.',
        },
        {
          type: 'p',
          text: 'You don\'t have to use a website. There are three ways in:',
        },
        {
          type: 'list',
          items: [
            '**Website** — the richest source, and the one to use if you have one.',
            '**Social profile** — point it at an existing account instead.',
            '**Describe it** — write a few sentences yourself.',
          ],
        },
        {
          type: 'p',
          text: 'Everything it produces is editable. Treat the result as a strong first draft, not a verdict — the brand profile is the single biggest lever on the quality of everything generated later, so it\'s worth ten minutes of your attention now.',
        },
      ],
    },
    {
      id: 'tune-it',
      heading: 'A few questions about your business',
      blocks: [
        {
          type: 'p',
          text: 'The remaining steps ask about your team size, your goals, and how you want to sound. These tune what gets generated for you. None of them are permanent — the whole profile stays editable under **Brand Profile** in the sidebar.',
        },
      ],
    },
    {
      id: 'your-dashboard',
      heading: 'Your dashboard, and the trial',
      blocks: [
        {
          type: 'p',
          text: 'You land on the dashboard. **Free includes a seven-day trial, and no card is needed** — you can generate, review and publish before deciding anything about billing.',
        },
        {
          type: 'p',
          text: 'From here the useful order is: connect your channels, then let Blitz fill your queue.',
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
            'One workspace per brand.',
            'Paste your site — it produces your brand profile and content angles.',
            'Every field stays editable.',
            'Seven-day trial, no card.',
          ],
        },
      ],
    },
  ],
};
