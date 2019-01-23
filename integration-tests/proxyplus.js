module.exports.handler = (event, context, callback) => {
  console.log("hello");
  console.log("logs");
  callback(null, {
    statusCode: 200,
    headers: { 'Content-Type': 'text/plain' },
    body: `Hello ${event.path}`
  });
}