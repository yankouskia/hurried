const { performance } = require('perf_hooks');
const path = require('path');
const { Thread } = require('../../src');
const { slow } = require('./slow');

const THREADS_COUNT = 10;

const threads = Array
  .from({ length: THREADS_COUNT })
  .map(_ => Thread.fromFile(path.resolve(__dirname, 'slow.js')));

(async () => {
  Thread.setMaxListeners(200);

  const startParallel = performance.now();
  await Promise.all(threads.map(thread => thread.run('slow')));
  console.log(`Parallel execution took ${performance.now() - startParallel} ms`);

  const startConcurrent = performance.now();
  Array.from({ length: THREADS_COUNT }).map(_ => slow());
  console.log(`Concurrent execution took ${performance.now() - startConcurrent} ms`);

  threads.forEach(t => t.terminate());
})()
