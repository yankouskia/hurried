/**
 * Wire protocol for parent <-> worker messaging.
 * Keep this tiny and stable — it's serialized across the V8 structured clone boundary.
 */

export interface RequestMessage {
  readonly __hurried: 'req';
  readonly id: string;
  readonly name: string;
  readonly args: ReadonlyArray<unknown>;
}

export interface ResponseMessage {
  readonly __hurried: 'res';
  readonly id: string;
  readonly ok: boolean;
  readonly result?: unknown;
  readonly error?: SerializedError;
}

export interface BusMessage {
  readonly __hurried: 'bus';
  readonly event: string;
  readonly payload: unknown;
}

export interface SerializedError {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
}

let __counter = 0;

export function createId(): string {
  __counter = (__counter + 1) >>> 0;
  return `${Date.now().toString(36)}-${__counter.toString(36)}`;
}

export function createRequest(
  name: string,
  args: ReadonlyArray<unknown>,
  id = createId(),
): RequestMessage {
  return { __hurried: 'req', id, name, args };
}

export function createResponse(
  id: string,
  ok: boolean,
  result?: unknown,
  error?: SerializedError,
): ResponseMessage {
  return { __hurried: 'res', id, ok, result, error };
}

export function isRequestMessage(value: unknown): value is RequestMessage {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as { __hurried?: string }).__hurried === 'req' &&
    typeof (value as RequestMessage).id === 'string' &&
    typeof (value as RequestMessage).name === 'string' &&
    Array.isArray((value as RequestMessage).args)
  );
}

export function createBusMessage(event: string, payload: unknown): BusMessage {
  return { __hurried: 'bus', event, payload };
}

export function isBusMessage(value: unknown): value is BusMessage {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as { __hurried?: string }).__hurried === 'bus' &&
    typeof (value as BusMessage).event === 'string'
  );
}

export function isResponseMessage(value: unknown): value is ResponseMessage {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as { __hurried?: string }).__hurried === 'res' &&
    typeof (value as ResponseMessage).id === 'string' &&
    typeof (value as ResponseMessage).ok === 'boolean'
  );
}

export function serializeError(err: unknown): SerializedError {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return { name: 'Error', message: String(err) };
}

export function deserializeError(err: SerializedError): Error {
  const e = new Error(err.message);
  e.name = err.name;
  if (err.stack) e.stack = err.stack;
  return e;
}
