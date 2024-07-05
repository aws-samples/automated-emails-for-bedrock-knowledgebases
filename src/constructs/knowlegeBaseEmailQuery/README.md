# Bedrock Knowledge Base Email Query Construct

This Construct builds an email flow for querying a Bedrock KnowledgeBase.  It uses the following comopnents:
* SES for receiving email queries and sending responses
* S3 Bucket for storing raw incoming emails
* DynamoDB table for storing email queries and their state
* Step Functions State Machine with Lambda functions for the following workflows:
  * Querying the pre-existing Knowledge Base and calculating confidence of a correct answer
  * Sending an email response to the original user if the confidence level is high enough
  * Sending an email response to an internal support contact if the confidence level is low

**NOTE**

This construct assumes a Bedrock KnowledgeBase pre-exists

**Props**

These values may be set as environment variables

| Env Var    | Description                                                       | 
|------------|-------------------------------------------------------------------|
| namePrefix | Character string to apppend to resources for uniqueness           |  
| knowledgeBaseId | The ID of the Bedrock Knowledge Base                              |  
 | queryModelArn   | The ARN of the Bedrock model to use when querying the Bedrock Knowledgebase |     