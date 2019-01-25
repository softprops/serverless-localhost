module.exports.handler = (event, context, callback) => {
  console.log('received event');
  console.log(event);
  callback(null, {
    statusCode: 200,
    body: JSON.stringify({ greeting: `Hello ${event.path}` })
  });
};
