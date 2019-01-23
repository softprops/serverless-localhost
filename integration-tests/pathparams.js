module.exports.handler = (event, context, callback) => {
  callback(null, {
    statusCode: 200,
    headers: { 'Content-Type': 'text/plain' },
    body: "Hello node"
  });
}