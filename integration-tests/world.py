import logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

def handler(event, ctx):
  logger.info("Logging...")
  logger.error(event)
  return {
    "statusCode": 200,
    "body": "hello python"
  }