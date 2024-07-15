import email
import json
import os
from datetime import datetime

import boto3


def handler(event):
    print("request: {}".format(json.dumps(event)))

    # retrieve environment variables
    email_source = os.environ.get("EMAIL_SOURCE")
    email_review_dest = os.environ.get("EMAIL_REVIEW_DEST")
    ddb_table = os.environ.get("DDB_TABLE")

    message = email.message_from_string(event["email"])

    if message.is_multipart():
        for part in message.walk():
            # each part is either non-multipart, or another multipart message
            # that contains further parts... Message is organized like a tree
            if part.get_content_type() == "text/plain":
                email_body = part.get_payload(decode=True).decode()
    else:
        email_body = message.get_payload(decode=True).decode()

    # Build email contents
    email_body_new = "******** Email response review ********"

    if not event["response"]:
        email_body_new = (
            email_body_new + "\n\n--------No Generated Response Message--------"
        )
    else:
        email_body_new = (
            email_body_new + "\n\n--------Generated Response Message--------"
        )
        email_body_new = (
            email_body_new
            + f"\n{event['response']}\n\nSincerely,\nHR Email Assistant\n\n"
        )
        email_body_new = (
            email_body_new
            + "Note: This email response was autogenerated, if you need further information please reach out to your local HR contact directly."
        )

    email_body_new = email_body_new + "\n\n--------Original Message--------"
    email_body_new = email_body_new + f"\nFrom: {message['From']}"
    email_body_new = email_body_new + f"\nSent: {message['Date']}"
    email_body_new = email_body_new + f"\nTo: {message['To']}"
    email_body_new = email_body_new + f"\nSubject: {message['Subject']}"
    email_body_new = email_body_new + f"\n\n{email_body}"

    # Send the email
    client = boto3.client("ses")
    response = client.send_email(
        Source=email_source,
        Destination={"ToAddresses": [email_review_dest]},
        Message={
            "Subject": {"Data": f"Email review - {message['Subject']}"},
            "Body": {"Text": {"Data": email_body_new}},
        },
    )

    # update disposition and timestamp in ddb
    disposition_ts = datetime.now().isoformat()

    # update record into dynamoDB
    dynamodb = boto3.client("dynamodb")

    dynamodb.update_item(
        TableName=ddb_table,
        Key={"email_id": {"S": event["email_id"]}},
        UpdateExpression="SET disposition = :disposition, disposition_ts = :disposition_ts",
        ExpressionAttributeValues={
            ":disposition": {"S": "Email Review"},
            ":disposition_ts": {"S": disposition_ts},
        },
        ReturnValues="UPDATED_NEW",
    )

    return {
        "statusCode": response["ResponseMetadata"]["HTTPStatusCode"],
        "body": email_body_new,
    }
