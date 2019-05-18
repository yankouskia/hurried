const { Thread } = require('../../src');

const code = `
  const { makeExecutable } = require(__dirname, 'src');

  function test(...params) {
    return params.reduce((a, b) => a + b);
  }

  makeExecutable(test, 'test');
`;

const thread = Thread.fromScript(code);

(async () => {
  const result = await thread.run('test', 'hello ', 'world ', '!');
  console.log(result);

  thread.terminate();
})()
