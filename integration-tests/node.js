module.exports.handler = (event, context, callback) => {
  callback(null, {
    httpStatus: 200,
    body: "Hello node"
  });
}