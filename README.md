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

1. You have a local machine or VM on which you can install and run AWS CLI tools
2. You have followed the [getting started steps](https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html) for AWS
   CDK to prepare your local environment to deploy the CDK stack
3. You have bootstrapped your environment `cdk bootstrap aws://{ACCOUNT_NUMBER}/{REGION}`
4. You own a valid domain name and have configuration rights over it. NOTE: If you have a domain name registered in
   Route53 and managed in this same account, this cdk will configure SES for you. If your domain is managed elsewhere
   then some manual steps will be necessary (see Deployment Steps below).
5. You have enabled the Bedrock models used for embedding and querying.
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

# Upload Source Files to S3

Now that you have a running Bedrock Knowledgebase you need to populate your vector store with the raw data you want to
query. Bedrock Knowledge Bases will automatically sync raw data in an S3 bucket with the Vector database powering
your Knowledge Base. To finish deployment of the app, you need to upload your raw text data to the Knowledge Base source
S3 bucket.

1. Locate the bucket name from the CDK output (KnowledgeBaseSourceBucketArn/Name)
2. Upload your text files, either through the AWS console or the AWS CLI.

If you are testing this solution out, we recommend using the documents in
this [open source HR manual](https://github.com/opengovfoundation/hr-manual?tab=readme-ov-file). Upload the files in
either the markdown or PDF folders. Your Knowledge Base will then automatically sync those files to the vector database.

# Finish Configuring SES

The mechanism for send and receiving emails is [Amazon Simple Email Service](https://aws.amazon.com/ses/). As part of
the deployment steps you will end up with an SES Identity for a specific domain name, meaning you can freely send and
receive emails on that domain.

If you need to be able to send emails to addresses of other domains you need to move your SES account out of sandbox
mode by [requesting production access](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html)

# Test

Send an email to the address defined in the "sourceEmail" context param. If you opted to upload the sample HR documents
referenced above here are some examples:

> How many days of PTO do I get?
>

# Useful Commands

* `cdk synth` Synthesize the CloudFormation template
* `cdk deploy` Deploy all