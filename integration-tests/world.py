def handler(event, ctx):
  print("I'm in your logs")
  return {
    "statusCode": 200,
    "body": "hello world"
  }