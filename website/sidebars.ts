import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docs: [
    'intro',
    'getting-started',
    {
      type: 'category',
      label: 'Guides',
      collapsed: false,
      items: [
        'guides/bus',
        'guides/thread',
        'guides/pool',
        'guides/parallel',
        'guides/file-workers',
      ],
    },
    'patterns',
    {
      type: 'category',
      label: 'API reference',
      collapsed: false,
      items: [
        'api/thread',
        'api/pool',
        'api/bus',
        'api/parallel',
        'api/define-worker',
        'api/errors',
        'api/options',
      ],
    },
    'migration',
    'faq',
  ],
};

export default sidebars;
