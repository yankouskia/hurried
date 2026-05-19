import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import { themes as prismThemes } from 'prism-react-renderer';

const config: Config = {
  title: 'hurried',
  tagline:
    'Modern, type-safe parallel execution for Node.js — workers, pools, and a typed event bus.',
  favicon: 'img/favicon.svg',

  url: 'https://yankouskia.github.io',
  baseUrl: '/hurried/',

  organizationName: 'yankouskia',
  projectName: 'hurried',
  deploymentBranch: 'gh-pages',
  trailingSlash: false,

  onBrokenLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  markdown: {
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },
  themes: ['@docusaurus/theme-mermaid'],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: '/',
          editUrl: 'https://github.com/yankouskia/hurried/edit/master/website/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/social-card.svg',
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: true,
    },
    metadata: [
      {
        name: 'keywords',
        content:
          'parallel, worker, threads, typescript, node.js, pool, concurrency, pub/sub, event bus',
      },
    ],
    navbar: {
      title: 'hurried',
      logo: {
        alt: 'hurried logo',
        src: 'img/logo.svg',
      },
      hideOnScroll: false,
      items: [
        { type: 'docSidebar', sidebarId: 'docs', position: 'left', label: 'Docs' },
        { to: '/guides/bus', label: 'The Bus', position: 'left' },
        { to: '/api/thread', label: 'API', position: 'left' },
        { to: '/patterns', label: 'Patterns', position: 'left' },
        {
          href: 'https://www.npmjs.com/package/hurried',
          label: 'npm',
          position: 'right',
        },
        {
          href: 'https://github.com/yankouskia/hurried',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            { label: 'Getting started', to: '/getting-started' },
            { label: 'The Bus', to: '/guides/bus' },
            { label: 'Patterns', to: '/patterns' },
            { label: 'API reference', to: '/api/thread' },
          ],
        },
        {
          title: 'Community',
          items: [
            { label: 'GitHub', href: 'https://github.com/yankouskia/hurried' },
            { label: 'Issues', href: 'https://github.com/yankouskia/hurried/issues' },
            { label: 'Discussions', href: 'https://github.com/yankouskia/hurried/discussions' },
          ],
        },
        {
          title: 'Resources',
          items: [
            { label: 'npm', href: 'https://www.npmjs.com/package/hurried' },
            {
              label: 'Changelog',
              href: 'https://github.com/yankouskia/hurried/blob/master/CHANGELOG.md',
            },
            { label: 'License', href: 'https://github.com/yankouskia/hurried/blob/master/LICENSE' },
          ],
        },
      ],
      copyright: `Built with Docusaurus · © ${new Date().getFullYear()} Alex Yankouski`,
    },
    prism: {
      theme: prismThemes.oneLight,
      darkTheme: prismThemes.oneDark,
      additionalLanguages: ['bash', 'json', 'diff', 'typescript'],
    },
    docs: {
      sidebar: {
        hideable: true,
        autoCollapseCategories: false,
      },
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
