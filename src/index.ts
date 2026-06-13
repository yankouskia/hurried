/**
 * hurried — modern, type-safe parallel execution for Node.js.
 *
 * @packageDocumentation
 */

export { Thread } from './thread.js';
export { Pool } from './pool.js';
export {
  parallel,
  mapParallel,
  mapParallelStream,
  mapParallelSettled,
  mapParallelStreamSettled,
} from './parallel.js';
export { makeExecutable, defineWorker } from './make-executable.js';
export { workerBus } from './worker-bus.js';
export { Bus } from './bus.js';

export {
  HurriedError,
  TaskError,
  TaskTimeoutError,
  TaskAbortedError,
  TerminatedError,
  WorkerExitedError,
} from './errors.js';

export type {
  ThreadOptions,
  PoolOptions,
  ParallelOptions,
  StreamOptions,
  RunOptions,
  Task,
  HandlerMap,
} from './types.js';

export type { StreamInput } from './stream.js';

export type { SettledResult } from './settled.js';

export type { RetryInput, RetryOptions } from './retry.js';

export type { EventMap, EmitArgs, Unsubscribe } from './bus.js';
