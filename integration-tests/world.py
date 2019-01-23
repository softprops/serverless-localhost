import logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

def handler(event, ctx):
  logger.info("Logging...")
  return {
    "statusCode": 200,
    "body": "hello python"
  }