import json
import email
import os
import boto3

def lambda_handler(event, context):

    # get environment variables
    knowledge_base_id = os.environ.get('KNOWLEDGE_BASE_ID')
    model_arn = os.environ.get('MODEL_ARN')

    # parse MIME email text for subject, body
    message = email.message_from_string(event['email'])
    if message.is_multipart():
        for part in message.walk():
            # each part is a either non-multipart, or another multipart message
            # that contains further parts... Message is organized like a tree
            if part.get_content_type() == 'text/plain':
                email_body= part.get_payload(decode=True).decode()
    else:
        email_body= message.get_payload(decode=True).decode()

    # adjust prompt based on email body
    prompt= f"Provide an email response to the following email: {email_body}"

    # call Bedrock Knowledge base with RetrieveAndGenerate
    bedrock= boto3.client('bedrock-agent-runtime')
    response_generated= True
    try:
        response = bedrock.retrieve_and_generate(
            input={'text':prompt[:1000]},
            retrieveAndGenerateConfiguration={
                'type':'KNOWLEDGE_BASE',
                'knowledgeBaseConfiguration': {
                    'knowledgeBaseId':knowledge_base_id,
                    'modelArn':model_arn
                }
            }
        )                
    
    except Exception as e:
        response_generated= False
        print(f"Exception: {e}")
        
    if response['ResponseMetadata']['HTTPStatusCode'] != 200:
        response_generated= False;
        
    print(f"status code= {response['ResponseMetadata']['HTTPStatusCode']}")
    print(f"response_generated= {response_generated}")
    print(response['output']['text'])

    return {
        'email_id': event['email_id'],
        'response_generated': response_generated,
        'email' : event['email'],
        'response': response['output']['text']
    }
