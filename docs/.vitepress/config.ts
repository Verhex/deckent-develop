import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Deckent',
  description: 'AI agent orchestration CLI — your AI development team, orchestrated.',

  // Base path for GitHub Pages (update if using custom domain)
  base: '/',

  // Clean URLs
  cleanUrls: true,

  // Head tags
  head: [
    ['link', { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' }],
    ['meta', { name: 'theme-color', content: '#5B21B6' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: 'Deckent' }],
  ],

  // Dark/light theme
  appearance: 'auto',

  // Exclude directories containing TypeScript generics, placeholder syntax (<N>, <T>, <Record>)
  // that VitePress Vue compiler treats as unclosed HTML elements.
  // Only guide/ and index.md are built as user-facing docs.
  srcExclude: [
    'directives/**',
    'analysis/**',
    'archive/**',
    'release/**',
    'development/**',
    'architecture/**',
    'reference/**',
    'SPRINT-LOG.md',
    'CHANGELOG.md',
  ],

  // Markdown config
  markdown: {
    lineNumbers: true,
  },


  // Theme config
  themeConfig: {
    // Logo placeholder
    logo: '/logo.svg',
    siteTitle: 'Deckent',

    // Top navigation
    nav: [
      { text: 'Home', link: '/' },
      {
        text: 'Docs',
        activeMatch: '^/(guide|reference|api)/',
        items: [
          { text: 'Getting Started', link: '/guide/getting-started' },
          { text: 'Architecture', link: '/guide/architecture' },
          { text: 'CLI Reference', link: '/reference/cli' },
          { text: 'API Reference', link: '/api/' },
          { text: 'MCP Guide', link: '/guide/mcp' },
          { text: 'Config Reference', link: '/reference/config' },
          { text: 'Plugin Development', link: '/guide/plugins' },
        ],
      },
      { text: 'Blog', link: '/blog/' },
      {
        text: 'GitHub',
        link: 'https://github.com/VerhexIO/deckent',
        target: '_blank',
        rel: 'noopener noreferrer',
      },
    ],

    // Sidebar configuration
    sidebar: {
      '/guide/': [
        {
          text: 'Getting Started',
          collapsed: false,
          items: [
            { text: 'Introduction', link: '/guide/introduction' },
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'First Sprint', link: '/guide/first-sprint' },
            { text: 'Core Concepts', link: '/guide/concepts' },
            { text: 'Configuration', link: '/guide/configuration' },
          ],
        },
        {
          text: 'Architecture',
          collapsed: false,
          items: [
            { text: 'Overview', link: '/guide/architecture' },
            { text: 'Brain & Orchestration', link: '/guide/brain' },
            { text: 'Workers', link: '/guide/workers' },
            { text: 'Auditor', link: '/guide/auditor' },
            { text: 'Skills System', link: '/guide/skills' },
          ],
        },
        {
          text: 'MCP Guide',
          collapsed: false,
          items: [
            { text: 'MCP Overview', link: '/guide/mcp' },
            { text: 'MCP Tools', link: '/guide/mcp-tools' },
            { text: 'MCP Resources', link: '/guide/mcp-resources' },
          ],
        },
        {
          text: 'Plugin Development',
          collapsed: true,
          items: [
            { text: 'Plugin System', link: '/guide/plugins' },
            { text: 'Writing a Plugin', link: '/guide/writing-plugins' },
            { text: 'Plugin API', link: '/guide/plugin-api' },
            { text: 'Publishing Plugins', link: '/guide/publishing-plugins' },
          ],
        },
      ],
      '/reference/': [
        {
          text: 'CLI Reference',
          collapsed: false,
          items: [
            { text: 'Overview', link: '/reference/cli' },
            { text: 'deckent start', link: '/reference/cli-start' },
            { text: 'deckent status', link: '/reference/cli-status' },
            { text: 'deckent config', link: '/reference/cli-config' },
            { text: 'deckent doctor', link: '/reference/cli-doctor' },
            { text: 'deckent finalize', link: '/reference/cli-finalize' },
          ],
        },
        {
          text: 'Config Reference',
          collapsed: false,
          items: [
            { text: 'Configuration Overview', link: '/reference/config' },
            { text: 'Provider Settings', link: '/reference/config-provider' },
            { text: 'Sprint Settings', link: '/reference/config-sprint' },
            { text: 'Memory Settings', link: '/reference/config-memory' },
            { text: 'Auditor Settings', link: '/reference/config-auditor' },
            { text: 'Output Settings', link: '/reference/config-output' },
          ],
        },
      ],
      '/api/': [
        {
          text: 'API Reference',
          collapsed: false,
          items: [
            { text: 'Overview', link: '/api/' },
            { text: 'REST API', link: '/api/rest' },
            { text: 'Health Endpoints', link: '/api/health' },
            { text: 'Config Endpoints', link: '/api/config' },
            { text: 'Sprint Endpoints', link: '/api/sprint' },
            { text: 'WebSocket', link: '/api/websocket' },
          ],
        },
      ],
    },

    // Social links
    socialLinks: [
      { icon: 'github', link: 'https://github.com/VerhexIO/deckent' },
    ],

    // Footer
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2025-present Alperen @ Verhex',
    },

    // Search
    search: {
      provider: 'local',
    },

    // Edit link
    editLink: {
      pattern: 'https://github.com/VerhexIO/deckent/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },

    // Last updated
    lastUpdated: {
      text: 'Updated at',
      formatOptions: {
        dateStyle: 'full',
        timeStyle: 'medium',
      },
    },

    // Docs version
    docFooter: {
      prev: 'Previous page',
      next: 'Next page',
    },
  },
});
