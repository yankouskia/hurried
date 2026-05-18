/**
 * Basic Thread usage — run a single inline task in a worker.
 *
 *   npm run example:basic
 */
import { Thread } from '../src/index.js';

const thread = Thread.fromFunction((n: number) => {
  let total = 0;
  for (let i = 0; i < n; i++) total += i;
  return total;
});

const result = await thread.run(1_000_000);
console.log('sum =', result);
await thread.terminate();
