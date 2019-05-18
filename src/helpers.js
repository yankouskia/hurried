module.exports.createRequestMessage = (functionName, params) => ({
  id: Math.random().toString(),
  functionName,
  params,
});

module.exports.createResponseMessage = (functionName, id, data, error) => ({
  functionName,
  id,
  data,
  error,
});

module.exports.isRequestMessage = message => message && message.functionName && message.id && message.params;
module.exports.isResponseMessage = message => message && message.functionName && message.id;
