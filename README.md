# Automated Email Queries to Amazon Bedrock Knowledge Bases

This application is a demonstration of using email and Retrieval Augmented Generation (RAG) to automate email
queries to an existing knowledge base.

This is built using the [AWS Cloud Development Kit (CDK)](https://aws.amazon.com/cdk/) which is a wrapper around
CloudFormation, allowing you to define your cloud resources in your programming language of choice. This particular CDK
app is written in Typescript(NodeJS); it deploys Lambdas written in both Python and TypeScript

This app consists of a single Stack: AutomateEmailsBedrockStack which deploys two custom constructs:

* BedrockKnowledgeBase
    * A complete Bedrock Knowledge Base implementation
* KnowledgeBaseEmailQuery
    * A Step Functions-powered email pipeline utilizing SES, Lambda, and the previously created Bedrock Knowledge Base

# Pre-reqs

1. You have a local machine, VM, or Cloud9 instance with which you can install and run AWS CLI tools
2. You have followed the [getting started steps](https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html) for AWS
   CDK to prepare your local environment to deploy the CDK stack
3. You own a valid domain name and have configuration rights over it. NOTE: If you have a domain name registered in
   Route53 and managed in this same account, this cdk will configure SES for you. If your domain is managed elsewhere
   then some manual steps will be necessary (see Deployment Steps below).
4. You have enabled the Bedrock models used for embedding and querying.
   See [documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html#model-access-add) for more
   info. In the default configuration, these are the ones to enable:
    1. Amazon Titan Text Embeddings V2
    2. Anthropic Claude 3 Sonnet

# Context Values

This app is configurable via a set of values defined in
the [CDK Context](https://docs.aws.amazon.com/cdk/v2/guide/context.html). Many of these values have defaults but may be
overridden via the --context flag when synth-ing or deploying

| Context Value     | Description                                                                                               | Default                                                                             |
|-------------------|-----------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------|
| emailSource       | The email address to receive queries on                                                                   | NONE                                                                                |
| emailReviewDest   | The email address to which any messages that fail to generate a response from the knowledge base get sent | NONE                                                                                |
| namePrefix        | A string character prefix to give uniqueness to the generated resources                                   | "automate-emails-bedrock"                                                           |
| embedModelArn     | The ARN of the Bedrock embeddings model                                                                   | arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-embed-text-v2:0            |
| queryModelArn     | The ARN of the Bedrock querying model                                                                     | arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0 |
| route53HostedZone | If using a Route53 Public Hosted Zone include the name here for auto-configuration of SES                 | NONE                                                                                |

# Deployment Steps

1. Configure Email to allow SES to receive messages
    1. If you want to receive email on address for a domain managed in Route53, this will be autowired for you if you
       provide the ROUTE53_HOSTED_ZONE environment variable
    2. If you managed your domain elsewhere you need to confirm your email identity in SES
2. Clone repository and navigate to root
   directory ```git clone https://github.com/aws-samples/automated-emails-for-bedrock-knowledgebases.git && cd automated-emails-for-bedrock-knowledgebases```
3. Install Dependencies `npm install`
4. Deploy App
    ```sh
    cdk deploy --context emailSource=help@mybedrockknowledgebaseapp.com --context emailReviewDest=support@mybedrockknowledgebaseapp.com --context route53HostedZone mybedrockkonwledgebaseapp.com
    ```

# Upload raw documents to S3

The CDK deployment process will have created an S3 bucket into which you can upload your raw files you want to serve as
the basis for the Bedrock Knowledgebase. You can easily upload your files using the aws cli with the ```aws s3 sync```
command.

1. Locate the KnowledgeBaseSourceBucketName from the CDK output
2. Navigate to the root directory where your files are located
3. Upload files ```aws s3 sync . s3://{BUCKET_NAME_HERE}```

# Finish Configuring SES

By default your SES account will be in a "sandbox" state. This means that it can only deliver emails to known and
verified recipients. To continue with testing you must either manually add a test user email address (Amazon SES->
Identities->Create Identity) or you
must [Request Production Access](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html)

# Test

Send an email to the address defined in the "sourceEmail" context param

# Useful Commands

* `cdk synth` Synthesize the CloudFormation template
* `cdk deploy` Deploy all