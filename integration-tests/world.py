import logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

def handler(event, ctx):
  logger.info("Handling as %s", ctx.function_name)
  return {
    "statusCode": 200,
    "body": "hello python"
  }