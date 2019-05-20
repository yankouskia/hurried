const { Worker, isMainThread } = require('worker_threads');
const { createRequestMessage, isResponseMessage } = require('./helpers');

module.exports.Thread = class Thread {
  constructor(worker) {
    if (!worker instanceof Worker) {
      throw new Error('Invalid type is passed in constructor; worker should be instance of Worker');
    }

    this.worker = worker;
  };

  static setMaxListeners(count) {
    require('events').EventEmitter.defaultMaxListeners = count;
  }

  static fromFile(filename, options) {
    const worker = new Worker(filename, {
      ...options,
      eval: false,
    });

    return new Thread(worker);
  }

  static fromScript(script, options) {
    const worker = new Worker(script, {
      ...options,
      eval: true,
    });

    return new Thread(worker);
  }

  static isMainThread() {
    return isMainThread();
  }

  run(name, ...params) {
    return new Promise((resolve, reject) => {
      const requestMessage = createRequestMessage(name, params);

      const handler = message => {
        if (!isResponseMessage(message) || message.id !== requestMessage.id) {
          return;
        }

        this.worker.removeListener('message', handler);

        if (message.error) {
          return reject(message.error);
        }

        return resolve(message.data);
      };

      const errorHandler = e => {
        this.worker.removeListener('error', errorHandler);
        reject(new Error(e));
      }

      this.worker.on('message', handler);
      this.worker.on('error', errorHandler);
      this.worker.postMessage(requestMessage);
    });
  }

  terminate(cb) {
    this.worker.terminate(cb);
  }
};
