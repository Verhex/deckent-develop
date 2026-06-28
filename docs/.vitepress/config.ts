import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Deckent',
  description: 'AI agent orchestration CLI — your AI development team, orchestrated.',

  // Base path for GitHub Pages (update if using custom domain)
  base: '/',

  // Clean URLs
  cleanUrls: true,

  // Sprint 172 C3: dead-link gate enabled. Cross-cut validation via scripts/lint-links.mjs.
  // VitePress build will fail on dead links — keeps OSS GA docs honest.
  ignoreDeadLinks: false,

  // Head tags
  head: [
    ['link', { rel: 'icon', href: '/favicon.png', type: 'image/png' }],
    ['meta', { name: 'theme-color', content: '#5B21B6' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: 'Deckent' }],
  ],

  // Dark/light theme
  appearance: 'auto',

  // Exclude directories containing TypeScript generics, placeholder syntax (<N>, <T>, <Record>),
  // or HTML-like substrings (e.g. `<noreply@anthropic.com>` in co-author trailers, `<PID>` in
  // placeholders) that VitePress's Vue compiler treats as unclosed HTML elements. These are
  // developer notes / specs / audits, not user-facing documentation.
  // User-facing build set (NOT excluded): guide/, reference/, adr/, design/, security/,
  // vision/ + root files (index.md, KNOWN_ISSUES.md, ROADMAP-GOD-LEVEL.md, worker-guide.md).
  srcExclude: [
    'directives/**',
    'analysis/**',
    'archive/**',
    'release/**',
    'development/**',
    'architecture/**',
    'superpowers/**',
    'audits/**',
    'launch/**',
    'governance/**',
    // Memory dumps / drafts / personal notes — not user-facing docs, and their
    // raw frontmatter + free-form prose (unescaped `:` in YAML, `{{ }}`, `<...>`)
    // break VitePress's YAML/Vue compiler. Excluded so the published site builds.
    'core-memory/**',
    'cookbook/**',
    'benchmark/**',
    'alperen-analysis/**',
    'comparison/**',
    'SPRINT-LOG.md',
    'CHANGELOG.md',
  ],

  // Markdown config
  markdown: {
    lineNumbers: true,
  },


  // Theme config
  themeConfig: {
    // Brand emblem — pixel-art circuit kraken (ADR-021)
    logo: '/logo.png',
    siteTitle: 'Deckent',

    // Top navigation
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Docs', link: '/guide/getting-started', activeMatch: '^/guide/' },
      { text: 'Reference', link: '/reference/cli', activeMatch: '^/reference/' },
      { text: 'Blog', link: '/guide/getting-started' },
      {
        text: 'GitHub',
        link: 'https://github.com/VerhexIO/deckent',
        target: '_blank',
        rel: 'noopener noreferrer',
      },
    ],

    // Sidebar configuration
    // Sidebar — matches the actual docs/guide/ (14) + docs/reference/ (21) files.
    // Rewritten 2026-05-22: previous sidebar described a doc structure that never
    // shipped (Sprint 172 doc-reorg residue). See alperen-analysis/2026-05-22-vitepress-config-audit.md
    sidebar: {
      '/guide/': [
        {
          text: 'Getting Started',
          collapsed: false,
          items: [
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Installation', link: '/guide/installation' },
            { text: 'Quickstart', link: '/guide/quickstart' },
            { text: 'Your First Sprint', link: '/guide/first-sprint' },
          ],
        },
        {
          text: 'Core Concepts',
          collapsed: false,
          items: [
            { text: 'Core Concepts', link: '/guide/concepts' },
            { text: 'Workers', link: '/guide/workers' },
            { text: 'Nervous System', link: '/guide/nervous-system' },
          ],
        },
        {
          text: 'Backends & Operations',
          collapsed: false,
          items: [
            { text: 'Docker Backend', link: '/guide/docker-backend' },
            { text: 'Config Recovery', link: '/guide/config-recovery' },
            { text: 'Troubleshooting', link: '/guide/troubleshooting' },
          ],
        },
        {
          text: 'Web Terminal',
          collapsed: false,
          items: [
            { text: 'Embedded Web Terminal', link: '/guide/terminal' },
            { text: 'Gömülü Web Terminali (Türkçe)', link: '/guide/terminal-tr' },
          ],
        },
        {
          text: 'Help',
          collapsed: false,
          items: [
            { text: 'FAQ', link: '/guide/faq' },
            { text: 'Deckent Nedir? (Türkçe)', link: '/guide/deckent-nedir' },
          ],
        },
      ],
      '/reference/': [
        {
          text: 'CLI Reference',
          collapsed: false,
          items: [
            { text: 'CLI Overview', link: '/reference/cli' },
            { text: 'CLI Commands', link: '/reference/cli-commands' },
          ],
        },
        {
          text: 'Architecture',
          collapsed: false,
          items: [
            { text: 'API Surface', link: '/reference/api-surface' },
          ],
        },
        {
          text: 'Plugin Development',
          collapsed: false,
          items: [
            { text: 'Managed Docs', link: '/reference/managed-docs' },
            { text: 'Marketplace', link: '/reference/marketplace' },
          ],
        },
        {
          text: 'Configuration',
          collapsed: false,
          items: [
            { text: 'Config Overview', link: '/reference/config' },
            { text: 'Config Reference', link: '/reference/config-reference' },
          ],
        },
        {
          text: 'API Reference',
          collapsed: false,
          items: [
            { text: 'API Overview', link: '/reference/api' },
            { text: 'API Examples', link: '/reference/api-examples' },
          ],
        },
        {
          text: 'MCP',
          collapsed: false,
          items: [
            { text: 'MCP Guide', link: '/reference/mcp-guide' },
            { text: 'MCP Tools', link: '/reference/mcp-tools' },
            { text: 'MCP Resources', link: '/reference/mcp-resources' },
          ],
        },
        {
          text: 'Agents & Skills',
          collapsed: false,
          items: [
            { text: 'Agents', link: '/reference/agents' },
            { text: 'Skills', link: '/reference/skills' },
          ],
        },
        {
          text: 'Operations',
          collapsed: false,
          items: [
            { text: 'Multi-Provider', link: '/reference/multi-provider' },
            { text: 'Health Check', link: '/reference/health-check' },
            { text: 'Performance', link: '/reference/performance' },
            { text: 'Security', link: '/reference/security' },
            { text: 'Managed Docs', link: '/reference/managed-docs' },
            { text: 'Marketplace', link: '/reference/marketplace' },
            { text: 'Migration Guide', link: '/reference/migration-guide' },
            { text: 'Features', link: '/reference/features' },
            { text: 'Glossary', link: '/reference/glossary' },
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
