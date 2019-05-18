const path = require('path');
const { Thread } = require('../../src');

const thread = Thread.fromFile(path.resolve(__dirname, 'iteration.js'));

(async () => {
  Thread.setMaxListeners(15000);
  const results = await Promise.all(Array.from({ length: 1000 }).map(_ => thread.run('long', 100000)));

  console.log(results);

  thread.terminate();
})()
