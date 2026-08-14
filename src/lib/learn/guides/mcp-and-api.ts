import type { Guide } from '../types';

export const mcpAndApi: Guide = {
  slug: 'mcp-and-api',
  title: 'Connect NativPost to Claude and other AI assistants',
  summary:
    'The MCP server puts your workspace inside an AI assistant — read your brand voice, draft posts and '
    + 'run campaigns from the conversation.',
  category: 'developers',
  order: 1,
  readingMinutes: 5,
  readNext: ['get-started', 'campaigns'],
  sections: [
    {
      id: 'what-mcp-is',
      heading: 'What this is',
      blocks: [
        {
          type: 'p',
          text: 'The **NativPost MCP server** connects your workspace to AI assistants that speak the [Model Context Protocol](https://modelcontextprotocol.io) — Claude Desktop, Claude Code, and others. Instead of writing API calls, you ask:',
        },
        {
          type: 'list',
          items: [
            '*"What\'s my brand voice, and which platforms am I connected to?"*',
            '*"Draft three Instagram captions about our new pricing and save them as drafts."*',
            '*"What\'s scheduled for next week?"*',
          ],
        },
        {
          type: 'p',
          text: 'It exposes 20 tools covering the same ground as the REST API: workspace and brand profile, content, and campaigns.',
        },
      ],
    },
    {
      id: 'setup',
      heading: 'Setting it up',
      blocks: [
        {
          type: 'steps',
          items: [
            { title: 'Create an API key', text: 'Settings → API keys. Keys look like np_live_… and are shown once. API access requires a paid plan.' },
            { title: 'Add the server to your client', text: 'Point it at the published package with your key in the environment.' },
            { title: 'Ask for something', text: 'Try "show me my NativPost plan and connected accounts".' },
          ],
        },
        {
          type: 'p',
          text: 'For **Claude Desktop**, add this to `claude_desktop_config.json`:',
        },
        {
          type: 'code',
          lang: 'json',
          code: `{
  "mcpServers": {
    "nativpost": {
      "command": "npx",
      "args": ["-y", "@nativpost/mcp"],
      "env": {
        "NATIVPOST_API_KEY": "np_live_your_key_here"
      }
    }
  }
}`,
        },
        {
          type: 'p',
          text: 'For **Claude Code**, one command:',
        },
        {
          type: 'code',
          lang: 'bash',
          code: 'claude mcp add nativpost --env NATIVPOST_API_KEY=np_live_your_key_here -- npx -y @nativpost/mcp',
        },
      ],
    },
    {
      id: 'safety',
      heading: 'What an assistant can and can\'t do',
      blocks: [
        {
          type: 'callout',
          tone: 'warn',
          text: 'An API key given to an assistant can publish to your connected social accounts. Use a dedicated key so you can revoke it without breaking your other integrations.',
        },
        {
          type: 'p',
          text: 'Tools are annotated so clients can tell reads from writes. Deleting content or a campaign is marked **destructive**; publishing a post and launching a campaign are marked **open-world**, because they reach live social accounts and consume quota. Well-behaved clients ask before running those.',
        },
        {
          type: 'p',
          text: 'The server holds your key and makes the same authenticated requests as the REST API — so the same plan limits, rate limits and permissions apply. It cannot do anything your API key could not.',
        },
      ],
    },
    {
      id: 'rest-api',
      heading: 'Or use the REST API directly',
      blocks: [
        {
          type: 'p',
          text: 'If you\'re building an application rather than working conversationally, use the REST API. Full reference, including webhooks and the MCP tool list, is at [docs.nativpost.com](https://docs.nativpost.com).',
        },
      ],
    },
  ],
};
