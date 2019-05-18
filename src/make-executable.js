const { isMainThread, parentPort } = require('worker_threads');
const { createResponseMessage, isRequestMessage } = require('./helpers');

module.exports.makeExecutable = (fn, name) => {
  if (isMainThread) return;

  parentPort.on('message', async msg => {
    if (!isRequestMessage(msg)) return;

    const { functionName, id, params } = msg;

    if (functionName === name) {
      try {
        const result = await fn.apply(null, params);
        parentPort.postMessage(createResponseMessage(name, id, result));
      } catch (e) {
        parentPort.postMessage(createResponseMessage(name, id, null, e.message));
      }
    }
  });
};
