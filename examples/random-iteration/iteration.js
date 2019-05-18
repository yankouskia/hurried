const { makeExecutable } = require('../../src');

function long(number) {
  for (let i = 0; i < number; i++) {
    if (i > Math.random() * 10000000) {
      return i;
    }
  }

  return number;
}

makeExecutable(long, 'long');
