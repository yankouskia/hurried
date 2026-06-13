export class HurriedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HurriedError';
  }
}

export class TaskError extends HurriedError {
  override readonly cause: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'TaskError';
    this.cause = cause;
  }
}

export class TaskTimeoutError extends HurriedError {
  readonly timeoutMs: number;
  constructor(timeoutMs: number) {
    super(`Task timed out after ${timeoutMs}ms`);
    this.name = 'TaskTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export class TaskAbortedError extends HurriedError {
  constructor(reason?: string) {
    super(reason ? `Task aborted: ${reason}` : 'Task aborted');
    this.name = 'TaskAbortedError';
  }
}

export class TerminatedError extends HurriedError {
  constructor() {
    super('Worker has been terminated');
    this.name = 'TerminatedError';
  }
}

/**
 * A worker exited on its own — a crash, `process.exit()` in task code, an OOM,
 * or a fatal uncaught error — rather than being torn down by `terminate()`.
 * Kept distinct from {@link TerminatedError} so fault-tolerant batches can treat
 * a dead worker as a recoverable per-item failure instead of a deliberate stop.
 */
export class WorkerExitedError extends HurriedError {
  /** The worker's exit code, when the runtime reported one. */
  readonly code?: number;
  constructor(code?: number) {
    super(
      code != null ? `Worker exited unexpectedly (code ${code})` : 'Worker exited unexpectedly',
    );
    this.name = 'WorkerExitedError';
    this.code = code;
  }
}
