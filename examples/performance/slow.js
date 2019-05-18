const { makeExecutable } = require('../../src');

function slow() {
  for (let i = 0; i < 1000000000; i++) {}
}

module.exports.slow = slow;

makeExecutable(slow, 'slow');
