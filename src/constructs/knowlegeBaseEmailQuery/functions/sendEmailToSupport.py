import json


def handler(event, context):
    print('request: {}'.format(json.dumps(event)))
    return {'foo': 'bar'}
