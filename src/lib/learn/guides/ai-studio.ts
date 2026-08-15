import type { Guide } from '../types';

export const aiStudio: Guide = {
  slug: 'ai-studio',
  title: 'AI Studio — images, video and talking heads',
  summary:
    'Five tabs, one grid of jobs. Pick a model, see the credit cost before you commit, and everything '
    + 'that finishes lands in your Media Library.',
  category: 'creating',
  order: 1,
  readingMinutes: 4,
  // No video yet — guide-06 has not been rendered, so there is nothing at
  // nativpost/learn/guide-06-ai-studio. Restore this line once the mp4 exists
  // and `npm run learn:upload-videos` has published it.
  readNext: ['blitz-daily-queue', 'campaigns'],
  sections: [
    {
      id: 'the-tabs',
      heading: 'Five tabs',
      blocks: [
        {
          type: 'p',
          text: 'AI Studio is where images, video and talking heads get made. It has five tabs:',
        },
        {
          type: 'table',
          head: ['Tab', 'What it makes'],
          rows: [
            ['Image', 'Still images from a prompt.'],
            ['Image Edit', 'Changes to an image you already have.'],
            ['Video', 'Short clips from a prompt.'],
            ['Talking Head', 'A photo plus an audio track, synced together.'],
            ['Long Form', 'Multi-scene video built from a script.'],
          ],
        },
      ],
    },
    {
      id: 'prompting',
      heading: 'Templates, or your own prompt',
      blocks: [
        {
          type: 'p',
          text: 'Pick a template to prefill a prompt, or write your own from scratch. Then choose a **model**, an **aspect ratio**, and — for video — **how long the clip should run**.',
        },
      ],
    },
    {
      id: 'credits',
      heading: 'Cost is shown before you commit',
      blocks: [
        {
          type: 'p',
          text: 'The badge tells you **what it will cost in credits before you commit to it**. Models differ substantially in price, and longer clips cost more, so the badge is worth reading rather than skipping.',
        },
        {
          type: 'callout',
          tone: 'tip',
          text: 'Iterate on a cheap model until the prompt is right, then run the final pass on the expensive one. The prompt is the part that takes attempts — the model is the part that costs.',
        },
      ],
    },
    {
      id: 'jobs',
      heading: 'Jobs run in the background',
      blocks: [
        {
          type: 'p',
          text: 'Submit, and the job joins the grid. **You can keep working while it renders** — leaving the page doesn\'t cancel anything.',
        },
        {
          type: 'p',
          text: 'Anything that finishes **syncs to your Media Library**, ready to attach to a post.',
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
            'Credits are shown up front.',
            'Jobs run in the background.',
            'Output lands in Media Library.',
          ],
        },
      ],
    },
  ],
};
