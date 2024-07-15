import json
import os
from datetime import datetime

import boto3
import botocore.exceptions


def handler(event, context):
    dynamodb_table = os.environ.get("DDB_TABLE")

    # log event to CloudWatch
    print(f"Received event: {json.dumps(event)}")

    # get the S3 key passed in to the handler
    key = event["detail"]["object"]["key"]
    bucket = event["detail"]["bucket"]["name"]

    print(f"bucket= {bucket}")
    print(f"key= {key}")

    # retrieve the object content from S3 given bucket name and key
    s3 = boto3.client("s3")
    obj = s3.get_object(Bucket=bucket, Key=key)

    # get the content of the bucket object as a string
    content = obj["Body"].read().decode("utf-8")

    # get email id
    email_id = key.split("/")[-1]
    received_ts = datetime.now().isoformat()
    print(f"   email_id: {email_id}")
    print(f"received_ts: {received_ts}")

    # put item into dynamoDB table
    try:
        dynamodb = boto3.client("dynamodb")

        # define the item to be inserted
        item = {
            "email_id": {"S": email_id},
            "received_ts": {"S": received_ts},
            "disposition": {"S": ""},
            "disposition_ts": {"S": ""},
        }
        response = dynamodb.put_item(TableName=dynamodb_table, Item=item)
        # print(f"PutItem succeeded: {response}")
    except botocore.exceptions.ClientError as error:
        print(f"An error occurred writing content to DynamoDB Table: {error}")

    return {"email_id": email_id, "received_ts": received_ts, "email": content}


def get_dynamo_table_name() -> str:
    ssm = boto3.client("ssm")
    response = ssm.getParameter(Name=os.environ.get("DDB_TABLE"))
    return response.Parameter.Value
