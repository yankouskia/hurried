/**
 * Performance — compare serial vs. parallel CPU-bound work using a pool.
 *
 *   npm run example:performance
 */
import { performance } from 'node:perf_hooks';
import { Pool } from '../src/index.js';

function slow(n: number): number {
  let acc = 0;
  for (let i = 0; i < n; i++) acc += Math.sqrt(i);
  return acc;
}

const ITERATIONS = 200_000_000;
const TASKS = 8;
const inputs = Array.from({ length: TASKS }, () => ITERATIONS);

// Serial baseline
const serialStart = performance.now();
for (const n of inputs) slow(n);
const serialMs = performance.now() - serialStart;

// Parallel via pool
const pool = new Pool({ size: 4, task: slow });
const parallelStart = performance.now();
await pool.map(inputs);
const parallelMs = performance.now() - parallelStart;
await pool.terminate();

console.log(`Serial:   ${serialMs.toFixed(1)} ms`);
console.log(`Parallel: ${parallelMs.toFixed(1)} ms`);
console.log(`Speedup:  ${(serialMs / parallelMs).toFixed(2)}x`);
