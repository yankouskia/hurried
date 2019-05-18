const {
  createRequestMessage,
  createResponseMessage,
  isRequestMessage,
  isResponseMessage,
} = require('./helpers');

describe('helpers', () => {
  const randomFn = Math.random();

  beforeEach(() => {
    Math.random = jest.fn(() => 'id');
  });

  afterEach(() => {
    Math.random = randomFn;
  });

  describe('createRequestMessage', () => {
    it('one argument', () => {
      expect(createRequestMessage('functionName', ['param1'])).toMatchSnapshot();
    });

    it('two arguments', () => {
      expect(createRequestMessage('functionName', ['param1', {}])).toMatchSnapshot();
    });
  });

  describe('createResponseMessage', () => {
    it('empty', () => {
      expect(createResponseMessage('functionName', 'id')).toMatchSnapshot();
    });

    it('with data', () => {
      expect(createResponseMessage('functionName', 'id', 'data')).toMatchSnapshot();
    });

    it('with error', () => {
      expect(createResponseMessage('functionName', 'id', null, 'error message')).toMatchSnapshot();
    });
  });

  describe('isRequestMessage', () => {
    it('true', () => {
      expect(isRequestMessage({ functionName: 'fn', id: 'id', params: [] })).toBeTruthy();
    });

    it('false', () => {
      expect(isRequestMessage('smth wrong')).toBeFalsy();
    });
  });

  describe('isResponseMessage', () => {
    it('error', () => {
      expect(isResponseMessage({ functionName: 'fn', id: 'id', error: 'error occured' })).toBeTruthy();
    });

    it('data', () => {
      expect(isResponseMessage({ functionName: 'fn', id: 'id', data: 'result' })).toBeTruthy();
    });

    it('without data and error', () => {
      expect(isResponseMessage({ functionName: 'fn', id: 'id' })).toBeTruthy();
    });

    it('false', () => {
      expect(isResponseMessage('smth wrong')).toBeFalsy();
    });
  });
});

