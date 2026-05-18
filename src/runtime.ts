/**
 * Code that runs *inside* an inline-function worker.
 *
 * Built as a string because Worker(code, { eval: true }) takes raw JS, not a module reference.
 * Kept in CommonJS form because that's what Node's worker eval mode defaults to.
 *
 * The runtime injects a {@link Bus}-like object as the first argument to the user task when
 * the user function is declared with two or more parameters. Single-parameter functions
 * keep the simple `(arg) => result` contract.
 */
export function buildInlineWorkerCode(taskSource: string, arity: number): string {
  const wantsBus = arity >= 2 ? 'true' : 'false';
  return `
const { parentPort } = require('worker_threads');
if (!parentPort) throw new Error('hurried: inline worker requires parentPort');

const __task = (${taskSource});
const __wantsBus = ${wantsBus};

const __busListeners = new Map();
const __bus = {
  emit: function (event, payload) {
    parentPort.postMessage({ __hurried: 'bus', event: String(event), payload: payload });
  },
  on: function (event, listener) {
    var key = String(event);
    var set = __busListeners.get(key);
    if (!set) { set = new Set(); __busListeners.set(key, set); }
    set.add(listener);
    return function () { set.delete(listener); };
  },
  once: function (event, listener) {
    var off = __bus.on(event, function (p) { off(); listener(p); });
    return off;
  },
  off: function (event, listener) {
    var set = __busListeners.get(String(event));
    if (set) set.delete(listener);
  },
};

function __serializeError(e) {
  if (e && typeof e === 'object') {
    return { name: e.name || 'Error', message: String(e.message || e), stack: e.stack };
  }
  return { name: 'Error', message: String(e) };
}

parentPort.on('message', async (msg) => {
  if (!msg) return;
  if (msg.__hurried === 'bus') {
    var set = __busListeners.get(String(msg.event));
    if (set) for (var l of set) l(msg.payload);
    return;
  }
  if (msg.__hurried !== 'req') return;
  const { id, name, args } = msg;
  try {
    if (name !== '__default__') {
      throw new Error('hurried: inline worker only supports the default task; got handler "' + name + '"');
    }
    const callArgs = __wantsBus ? [__bus].concat(args || []) : (args || []);
    const result = await __task.apply(null, callArgs);
    parentPort.postMessage({ __hurried: 'res', id: id, ok: true, result: result });
  } catch (e) {
    parentPort.postMessage({ __hurried: 'res', id: id, ok: false, error: __serializeError(e) });
  }
});
`;
}
