# Automated Email Queries to Amazon Bedrock Knowledgebases

This CDK application is a demonstration of using email and Retrieval Augmented Generation (RAG) to automate email queries to an existing knowledge base.

It consists of a single Stack: AutomateEmailsBedrockStack which deploys two custom constructs:

* BedrockKnowledgeBase
  * A complete Bedrock Knowledge Base implementation
* KnowledgeBaseEmailQuery
  * A Step Functions-powered email pipeline utilizing SES, Lambda, and the previously created Bedrock Knowledge Base

# Pre-reqs
1. You must own a valid domain name and have configuration rights over it.  NOTE: If you have a domain name registered in Route53 and managed in this same account this app will configure SES for you.  If your domain is managed elsewhere then some manual steps will be necessary (see Deployment Steps below).
2. The Bedrock models used for embedding and querying must be enabled.  See [documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html#model-access-add) for more info.  If you are using the default models, these are the ones to enable:
   3. Amazon Titan Embed Text v2
   4. Anthropic Claude 3 Sonnet

# Required Parameters
These environment variables are required before deployment

| Env Var             | Description                                                                               | 
|---------------------|-------------------------------------------------------------------------------------------|
| RECIPIENT_EMAIL     | The email address to receive queries on                                                   | 

# Optional Parameters
This app is pre-configured with defaults, however you can override these with environment variables.

| Env Var             | Description                                                                               | Default                                                                            |
|---------------------|-------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------|
| NAME_PREFIX         | A string character prefix to give uniqueness to the generated resources                   | "automate-emails-bedrock"                                                           |
| EMBED_MODEL_ARN     | The ARN of the Bedrock embeddings model                                                   | arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-embed-text-v2:0            |
| QUERY_MODEL_ARN     | The ARN of the Bedrock querying model                                                     | arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0 |
| ROUTE53_HOSTED_ZONE | If using a Route53 Public Hosted Zone include the name here for auto-configuration of SES | N/A                                                                                 |


# Deployment Steps

1. Configure Email to allow SES to receive messages
   2. If you want to receive email on address for a domain managed in Route53, this will be autowired for you if you provide the ROUTE53_HOSTED_ZONE environment variable
   3. If you managed your domain elsewhere you need to confirm your email identity in SES
2. Deploy App
```sh
npx cdk deploy
```
3. Upload Documents to S3




# API Call to enable access to a model
```typescript
https://bedrock.us-east-1.amazonaws.com/foundation-model-entitlement
{"modelId":"amazon.titan-embed-text-v1"}
```