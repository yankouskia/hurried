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
