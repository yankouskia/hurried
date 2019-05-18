const {
  createRequestMessage,
  createResponseMessage,
  isRequestMessage,
  isResponseMessage,
} = require('./helpers');

describe('createRequestMessage', () => {
  it('one argument', () => {
    expect(createRequestMessage('functionName', ['param1'])).toMatchSnapshot();
  });

  it('two arguments', () => {
    expect(createRequestMessage('functionName', ['param1', {}])).toMatchSnapshot();
  });
});

describe('createResponseMessage', () => {
  it('with data', () => {
    expect(createResponseMessage('functionName', 'data')).toMatchSnapshot();
  });

  it('with error', () => {
    expect(createResponseMessage('functionName', null, 'error message')).toMatchSnapshot();
  });
});

describe('isRequestMessage', () => {
  it('true', () => {
    expect(isRequestMessage({ functionName: 'fn', params: [] })).toBeTruthy();
  });

  it('false', () => {
    expect(isRequestMessage('smth wrong')).toBeFalsy();
  });
});

describe('isResponseMessage', () => {
  it('error', () => {
    expect(isResponseMessage({ functionName: 'fn', error: 'error occured' })).toBeTruthy();
  });

  it('data', () => {
    expect(isResponseMessage({ functionName: 'fn', data: 'result' })).toBeTruthy();
  });

  it('false', () => {
    expect(isResponseMessage('smth wrong')).toBeFalsy();
  });
});

