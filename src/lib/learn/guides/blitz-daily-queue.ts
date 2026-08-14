import type { Guide } from '../types';

export const blitzDailyQueue: Guide = {
  slug: 'blitz-daily-queue',
  title: 'Blitz — your daily content queue',
  summary:
    'A stack of drafts, ready to judge. Swipe or use the keyboard, undo mistakes, and shape what gets '
    + 'generated tomorrow.',
  category: 'daily-workflow',
  order: 1,
  readingMinutes: 4,
  video: { src: 'nativpost/learn/guide-03-blitz', duration: '1:15' },
  readNext: ['campaigns', 'get-started'],
  sections: [
    {
      id: 'what-blitz-is',
      heading: 'What Blitz is',
      blocks: [
        {
          type: 'p',
          text: 'Blitz is your **daily content queue** — drafts, ready to judge. Open it from the sidebar and it generates today\'s posts the first time you land. Each card shows **the source idea, and your version of it**, so you can see what it was working from.',
        },
      ],
    },
    {
      id: 'judging',
      heading: 'Judging the queue',
      blocks: [
        {
          type: 'p',
          text: 'Swipe right to approve, swipe left to skip. If you\'d rather keep your hands on the keyboard, the whole queue is drivable without the mouse:',
        },
        {
          type: 'shortcuts',
          items: [
            { keys: ['A'], label: 'Approve the current post' },
            { keys: ['S'], label: 'Skip it' },
            { keys: ['U'], label: 'Undo the last skip' },
          ],
        },
        {
          type: 'p',
          text: 'Skipped one by mistake? **U undoes it.** The toast that appears after a skip carries the same Undo action, if you\'d rather click.',
        },
      ],
    },
    {
      id: 'the-ring',
      heading: 'The progress ring',
      blocks: [
        {
          type: 'p',
          text: 'The ring at the top tracks how many you\'ve approved against today\'s limit. When the queue empties you\'re done for the day, and you\'ll get a summary — *"You reviewed 10 posts — 7 approved (70%)."* **Approved posts go to your calendar.**',
        },
      ],
    },
    {
      id: 'settings',
      heading: 'Settings drives what gets made',
      blocks: [
        {
          type: 'p',
          text: 'The **Settings** button shapes tomorrow\'s queue rather than today\'s:',
        },
        {
          type: 'table',
          head: ['Control', 'What it changes'],
          rows: [
            ['Posts per day', 'How many drafts land in the queue each day.'],
            ['Content mix', 'The balance of formats — UGC, talking head, slideshow, and so on.'],
            ['Influencer frequency', 'How often an AI influencer appears in the output.'],
            ['Quality threshold', 'Filters weak drafts out before you ever see them.'],
          ],
        },
        {
          type: 'callout',
          tone: 'tip',
          text: 'Raising the quality threshold means fewer posts, not better ones — it discards more of what was generated. If your queue is coming up short, lower it before raising posts per day.',
        },
      ],
    },
    {
      id: 'empty-queue',
      heading: 'If the queue comes up short',
      blocks: [
        {
          type: 'p',
          text: 'Blitz builds from approved templates in the shared library that match your content mix. If your workspace has worked through most of that library recently, there is less fresh material to draw on and the queue can come up short of your daily number.',
        },
        {
          type: 'p',
          text: 'If that happens, widen the content mix in Settings so more formats are eligible, or lower the quality threshold. A queue that reports it generated nothing is a real failure, not a finished day — it will say so rather than showing the "done for today" panel.',
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
            'Swipe, or press **A** and **S**.',
            '**U** undoes a skip.',
            'Settings drives what gets generated, from tomorrow.',
            'Approved posts go to your calendar.',
          ],
        },
      ],
    },
  ],
};
