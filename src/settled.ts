import { TaskAbortedError, TerminatedError } from './errors.js';

/**
 * The outcome of a single task in a fault-tolerant batch — the worker-thread
 * analogue of {@link PromiseSettledResult}. A task that threw becomes a
 * `rejected` entry instead of failing the whole operation.
 */
export type SettledResult<T> =
  | { status: 'fulfilled'; value: T }
  | { status: 'rejected'; reason: unknown };

/**
 * Run `run` and resolve to a {@link SettledResult} instead of rejecting on a
 * task failure. Cancellation and teardown ({@link TaskAbortedError},
 * {@link TerminatedError}) still reject — those stop the whole batch/stream
 * rather than being recorded per item.
 *
 * @internal
 */
export function settle<T>(run: () => Promise<T>): Promise<SettledResult<T>> {
  return run().then(
    (value): SettledResult<T> => ({ status: 'fulfilled', value }),
    (reason): SettledResult<T> => {
      if (reason instanceof TaskAbortedError || reason instanceof TerminatedError) throw reason;
      return { status: 'rejected', reason };
    },
  );
}
