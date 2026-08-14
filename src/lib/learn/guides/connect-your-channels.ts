import type { Guide } from '../types';

export const connectYourChannels: Guide = {
  slug: 'connect-your-channels',
  title: 'Connect your channels',
  summary:
    'Where connections live, what each platform demands before it will let you in, and the one platform '
    + 'that needs connecting twice.',
  category: 'accounts',
  order: 1,
  readingMinutes: 4,
  video: { src: 'nativpost/learn/guide-02-connect-channels', duration: '1:12' },
  readNext: ['blitz-daily-queue', 'managed-infrastructure'],
  sections: [
    {
      id: 'where-it-lives',
      heading: 'Where it lives',
      blocks: [
        {
          type: 'p',
          text: 'Everything lives under **Workspace** in the sidebar — scroll down and open **Social accounts**. Every platform you can publish to is listed there, grouped, and **each row is a single connection**.',
        },
      ],
    },
    {
      id: 'check-requirements-first',
      heading: 'Check the requirements before you connect',
      blocks: [
        {
          type: 'p',
          text: 'This is the step people skip, and it is the reason most connections fail. Press the **information button** on a row before connecting — it tells you what that platform expects of the account.',
        },
        {
          type: 'p',
          text: 'Instagram is the usual stumbling block: it needs a **business or creator account, linked to a Facebook page you administer**. A personal Instagram account cannot be published to by any tool, NativPost included — that is Meta\'s rule, not ours.',
        },
        {
          type: 'callout',
          tone: 'warn',
          text: 'If a connection fails, re-read the requirements before retrying. Almost every failure is an account-type problem, not a NativPost problem.',
        },
      ],
    },
    {
      id: 'the-hand-off',
      heading: 'The hand-off',
      blocks: [
        {
          type: 'steps',
          items: [
            { title: 'Press Connect', text: 'NativPost hands you to the platform\'s own approval screen. You are on their domain now — we never see your password.' },
            { title: 'Approve there', text: 'Grant the permissions the platform asks for. Declining any of them usually breaks publishing later.' },
            { title: 'You come straight back', text: 'Connected, with the account shown on the row.' },
          ],
        },
        { type: 'p', text: 'Every other platform follows the same shape.' },
      ],
    },
    {
      id: 'x-needs-two',
      heading: 'X is the exception',
      blocks: [
        {
          type: 'p',
          text: '**X needs two connections on the same account** — one for text, one for media. Connect both, or posts with images will fail while text-only posts succeed, which is a confusing way to find out.',
        },
      ],
    },
    {
      id: 'nothing-publishes-on-its-own',
      heading: 'Nothing publishes on its own',
      blocks: [
        {
          type: 'p',
          text: 'Connecting a channel does not start anything. **Every post still waits for your approval.** Connections only decide where an approved post is allowed to go.',
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
            'It\'s under **Workspace → Social accounts**.',
            'Press the (i) and check the requirements first.',
            'X needs two connections.',
            'Connecting publishes nothing by itself.',
          ],
        },
      ],
    },
  ],
};
