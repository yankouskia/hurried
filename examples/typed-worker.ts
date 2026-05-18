/**
 * Type-safe RPC across the worker boundary using `defineWorker` + `workerBus`.
 *
 *   npm run example:typed-worker
 *
 * Demonstrates the recommended pattern for non-trivial workers:
 *  - shared event-map and handler-map types
 *  - worker file uses `defineWorker` for typed RPC and `workerBus` for events
 *  - the main thread gets full IntelliSense on both run() and bus.on()
 *
 * Note: tsx will execute the worker .ts file directly. If you compile to .js, point
 * `Thread.fromFile` at the compiled file instead.
 */
import { fileURLToPath } from 'node:url';
import { Thread } from '../src/index.js';
import type { Events } from './typed-worker-impl.js';

const workerUrl = new URL('./typed-worker-impl.ts', import.meta.url);

const thread = Thread.fromFile<Events>(fileURLToPath(workerUrl), {
  execArgv: ['--import', 'tsx'],
});

thread.on('progress', (p) => {
  console.log(`  ${p.label}: ${p.done}/${p.total}`);
});
thread.on('log', (msg) => {
  console.log(`  log: ${msg}`);
});

const hashed = (await thread.run('hash', 'hello world')) as string;
const counted = (await thread.run('countItems', ['a', 'b', 'c', 'd'])) as number;

console.log(`  hash: ${hashed}`);
console.log(`  count: ${counted}`);

await thread.terminate();
