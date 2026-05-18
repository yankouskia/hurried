/**
 * hurried — modern, type-safe parallel execution for Node.js.
 *
 * @packageDocumentation
 */

export { Thread } from './thread.js';
export { Pool } from './pool.js';
export { parallel, mapParallel } from './parallel.js';
export { makeExecutable, defineWorker } from './make-executable.js';
export { workerBus } from './worker-bus.js';
export { Bus } from './bus.js';

export {
  HurriedError,
  TaskError,
  TaskTimeoutError,
  TaskAbortedError,
  TerminatedError,
} from './errors.js';

export type {
  ThreadOptions,
  PoolOptions,
  ParallelOptions,
  RunOptions,
  Task,
  HandlerMap,
} from './types.js';

export type { EventMap, EmitArgs, Unsubscribe } from './bus.js';
