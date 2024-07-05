import json
import uuid
import os
import boto3

def lambda_handler(event, context):
    
    # retrieve environment variables
    knowledge_base_id = os.environ.get('KNOWLEDGE_BASE_ID')
    data_source_id = os.environ.get('DATA_SOURCE_ID')
    
    # object/doc added to S3
    key = event['Records'][0]['s3']['object']['key']
    print(f"object added/deleted in data source: {key}")
    
    # kb client
    client= boto3.client('bedrock-agent')
    client_token= str(uuid.uuid4())

    response= client.start_ingestion_job(
        clientToken=f"{client_token}",
        dataSourceId=data_source_id,
        description=f"object added/deleted in data source: {key}",
        knowledgeBaseId=knowledge_base_id
    )

    ingestion_job_id = response['ingestionJob']['ingestionJobId']
    job_status = client.get_ingestion_job(
        dataSourceId=data_source_id,
        knowledgeBaseId=knowledge_base_id,
        ingestionJobId=ingestion_job_id
    )
    
    job_state_status= job_status['ingestionJob']['status']
    job_state= f"ingestion job: object= {key} jobid= {ingestion_job_id} state= {job_state_status}"
    print(job_state)

    return {
        'statusCode': response['ResponseMetadata']['HTTPStatusCode'],
        'body': json.dumps(job_state)
    }
