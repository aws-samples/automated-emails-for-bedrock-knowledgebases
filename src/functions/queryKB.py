import json
import random


def handler(event, context):
    print('request: {}'.format(json.dumps(event)))
    return {'confidence': random.random()}
