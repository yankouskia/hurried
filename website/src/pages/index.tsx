import type { ReactNode } from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import CodeBlock from '@theme/CodeBlock';

import styles from './index.module.css';

function Hero(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className={clsx('hero', styles.hero)}>
      <div className="container">
        <div className={styles.heroInner}>
          <h1 className={styles.heroTitle}>
            <span className={styles.gradient}>hurried</span>
          </h1>
          <p className={styles.heroTagline}>{siteConfig.tagline}</p>

          <div className={styles.heroButtons}>
            <Link className="button button--primary button--lg" to="/getting-started">
              Get started →
            </Link>
            <Link className="button button--secondary button--lg" to="/guides/bus">
              Meet the Bus
            </Link>
            <Link
              className="button button--outline button--lg"
              to="https://github.com/yankouskia/hurried"
            >
              ★ GitHub
            </Link>
          </div>

          <div className={styles.heroCode}>
            <CodeBlock language="ts" showLineNumbers>
              {`import { Thread } from 'hurried';

type Events = { progress: { done: number; total: number } };

const thread = Thread.fromFunction<Events, number, number>((bus, n) => {
  for (let i = 0; i < n; i++) {
    if (i % 1_000_000 === 0) bus.emit('progress', { done: i, total: n });
  }
  return n;
});

thread.on('progress', (p) => console.log(\`\${p.done}/\${p.total}\`));

await thread.run(50_000_000);
await thread.terminate();`}
            </CodeBlock>
          </div>
        </div>
      </div>
    </header>
  );
}

interface FeatureProps {
  title: string;
  body: string;
  emoji: string;
}

const features: FeatureProps[] = [
  {
    emoji: '🧠',
    title: 'Type-safe everywhere',
    body: 'Define one event map; both the main thread and the worker get the same typed `on / emit` API. Rename a field, both sides break at compile time.',
  },
  {
    emoji: '⚡',
    title: 'Inline-function workers',
    body: 'No more separate worker files for simple jobs. Pass a function — hurried serializes it, spawns the worker, and gives you a typed `Promise<T>`.',
  },
  {
    emoji: '🚌',
    title: 'A bus across the boundary',
    body: 'Streaming progress, cooperative cancellation, state-machine workers — all with five methods: `emit / on / once / off / waitFor`.',
  },
  {
    emoji: '🏊',
    title: 'Pools with queue + backpressure',
    body: '`new Pool({ size: 4, task })` and you have parallel CPU-bound throughput with bounded resource use. Events from any worker, broadcasts to all.',
  },
  {
    emoji: '🧰',
    title: 'AbortSignal & timeouts',
    body: 'Every primitive accepts a per-call `timeout` and an `AbortSignal`. Structured error hierarchy means you can catch exactly what went wrong.',
  },
  {
    emoji: '📦',
    title: 'Zero deps, ESM + CJS',
    body: 'Dual build, full `.d.ts` generation, Node 18+. The whole library is ~20kB minified.',
  },
];

function Features(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className={styles.featureGrid}>
          {features.map((f) => (
            <div key={f.title} className={styles.featureCard}>
              <div className={styles.featureEmoji}>{f.emoji}</div>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function BusShowcase(): ReactNode {
  return (
    <section className={styles.section}>
      <div className="container">
        <div className={styles.sectionHeader}>
          <span className={styles.eyebrow}>The hurried difference</span>
          <h2>
            One event map. Two endpoints. Zero <code>any</code>.
          </h2>
          <p>
            Declare a single <code>type Events</code> contract and both sides of the worker boundary
            speak the same typed language. No protocol buffers, no schemas — just TypeScript doing
            its job.
          </p>
        </div>

        <div className={styles.busGrid}>
          <div className={styles.busSide}>
            <h4>Main thread</h4>
            <CodeBlock language="ts" title="main.ts">
              {`const thread = Thread.fromFunction<Events, number, number>(
  (bus, n) => {
    bus.emit('progress', { done: n, total: n });
    return n;
  },
);

thread.on('progress', (p) => {
  // p: { done: number; total: number }
  render(p.done / p.total);
});

await thread.run(10_000_000);`}
            </CodeBlock>
          </div>
          <div className={styles.busSide}>
            <h4>Shared event map</h4>
            <CodeBlock language="ts" title="events.ts">
              {`export type Events = {
  progress: { done: number; total: number };
  log: string;
  cancel: void;        // void event
};`}
            </CodeBlock>
            <h4 style={{ marginTop: '1.4rem' }}>Worker file (optional)</h4>
            <CodeBlock language="ts" title="worker.ts">
              {`import { defineWorker, workerBus } from 'hurried';
import type { Events } from './events.js';

const bus = workerBus<Events>();

export default defineWorker({
  process(items: string[]) {
    items.forEach((it, i) =>
      bus.emit('progress', { done: i + 1, total: items.length }),
    );
    return items.length;
  },
});`}
            </CodeBlock>
          </div>
        </div>
      </div>
    </section>
  );
}

function CallToAction(): ReactNode {
  return (
    <section className={styles.cta}>
      <div className="container">
        <h2>Ready to stop blocking the event loop?</h2>
        <p>One install, two lines of code, every CPU core in your machine.</p>
        <CodeBlock language="bash">npm install hurried</CodeBlock>
        <div className={styles.heroButtons}>
          <Link className="button button--primary button--lg" to="/getting-started">
            Read the quick start
          </Link>
          <Link className="button button--secondary button--lg" to="/patterns">
            Browse patterns
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title={`${siteConfig.title} · parallel execution for Node.js`}
      description={siteConfig.tagline}
    >
      <Hero />
      <main>
        <Features />
        <BusShowcase />
        <CallToAction />
      </main>
    </Layout>
  );
}
