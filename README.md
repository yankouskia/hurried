[![CircleCI](https://circleci.com/gh/yankouskia/hurried.svg?style=shield)](https://circleci.com/gh/yankouskia/hurried) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/yankouskia/hurried/pulls) [![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/yankouskia/hurried/blob/master/LICENSE)

[![NPM](https://nodei.co/npm/hurried.png?downloads=true)](https://www.npmjs.com/package/hurried)

# hurried

JavaScript library for ~~concurrent~~ **_parallel_** code execution.

## Motivation

Library is built on top of new [Worker Threads](https://nodejs.org/api/worker_threads.html) functionality, which is introduced in [Node 10.5.0](https://nodejs.org/en/blog/release/v10.5.0/).
There is an existing API for [forking processes in Node.js](https://nodejs.org/api/child_process.html). That solution is not the best, because forking a process is pretty expensive operation in terms of resources, which could be very slow. Creating worker thread is much faster and requires less resources.

## How to use

To install library:

```sh
# yarn
yarn add hurried

# npm
npm install hurried --save
```

Library is designed to create **independent JavaScript execution thread** for parallel execution. Most Node.js APIs are available inside of it. To create thread:

```js
// ES6 modules
import { Thread } from 'hurried';

// CommonJS modules
const { Thread } = require('hurried');

// To create execution thread for any file:
const threadFromFile = Thread.fromFile(path.resolve(__dirname, 'test.js'));

// To create execution thread from any script:
const threadFromScript = Thread.fromScript(`
  for (let i = 0; i < 10 ** 9; i++) {
    // some logic
  }
`);

```

Creating new `Thread` runs `script`/`module` immediately. Such approach is useful for creating several execution threads for issues, which require CPU intensive tasks.


## Run specific function

`hurried` allows you to specify functions in your code, which will be accessible for calling from the main thread.
To specify such function:

```js
const { makeExecutable } = require('hurried');

function slowFunction(...params) {
  // some slow code which requires intensive blocking CPU work
  return params;
}

module.exports.slowFunction = slowFunction;

makeExecutable(slowFunction, 'slow');
```

`makeExecutable` will not do anything, if it will be ran directly from main thread. If it will be used in another execution thread it will make that function `executable`.

To use that from main thread:

```js
const { Thread } = require('hurried');]

(async () => {
  const thread = Thread.fromFile(path.resolve(__dirname, 'slow.js'));
  const slowResult = await thread.run('slow', 'param', 1);

  thread.terminate();
})()
```


## API

### Thread

`static Thread.setMaxListeners(count: number): void`

The same as [Node.js Event Emitter setMaxListeners](https://nodejs.org/api/events.html#events_emitter_setmaxlisteners_n) to help finding/preventing memory leaks.

`static Thread.isMainThread(): boolean`

Returns true, if code is not running inside Worker.

`static Thread.fromFile(filename: string, options: OptionsType): Thread`

Creates independent JavaScript execution thread from module.

`static Thread.fromScript(filename: string, options: OptionsType): Thread`

Creates independent JavaScript execution thread from code script.

`thread.run(name [, ...params: any[]]): Function<return|resolve>`

Provides ability to run specific function from independent JavaScript execution thread.
Any serializable params could be used.
Function which is called from another thread could return any serializable value or `Promise`, which is resolved with serializable value.

`thread.terminate([callback]): void`

Stop all JavaScript execution in the worker thread as soon as possible.
callback is an optional function that is invoked once this operation is known to have completed.


### makeExecutable

`makeExecutable(fn: Function, name: String): void`

Provides ability to make function callable and executable inside independent JavaScript execution thread from main thread.
Function should return any serializable value or `Promise`, wchich is resolved with that value.


### OptionsType

`env: Object`

If set, specifies the initial value of process.env inside the Worker thread. As a special value, worker.SHARE_ENV may be used to specify that the parent thread and the child thread should share their environment variables; in that case, changes to one thread’s process.env object will affect the other thread as well. Default: process.env.

`execArgv: string[]`

List of node CLI options passed to the worker. V8 options (such as --max-old-space-size) and options that affect the process (such as --title) are not supported. If set, this will be provided as process.execArgv inside the worker. By default, options will be inherited from the parent thread.

`stdin: boolean`

If this is set to true, then worker.stdin will provide a writable stream whose contents will appear as process.stdin inside the Worker. By default, no data is provided.

`stdout: boolean`

If this is set to true, then worker.stdout will not automatically be piped through to process.stdout in the parent.

`stderr: boolean`

If this is set to true, then worker.stderr will not automatically be piped through to process.stderr in the parent.

`workerData: any`

Any JavaScript value that will be cloned and made available as require('worker_threads').workerData. The cloning will occur as described in the HTML structured clone algorithm, and an error will be thrown if the object cannot be cloned (e.g. because it contains functions).


## Examples

There are several examples in projects, which could be helpful to start.
Example could be found [here](https://github.com/yankouskia/hurried/tree/master/examples)

Running [this example](https://github.com/yankouskia/hurried/tree/master/examples/performance) allows to see how **fast** to run CPU blocking code in seperate threads

## Restriction

At least `Node.js 10.5.0` is required to run this library

## Contributing

`hurried` is open-source library, opened for contributions

### Tests

`jest` is used for tests. To run tests:

```sh
yarn test
```

### License

hurried is [MIT licensed](https://github.com/yankouskia/hurried/blob/master/LICENSE)
