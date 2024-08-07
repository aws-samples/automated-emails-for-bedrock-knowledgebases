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

**Important**: this application uses various AWS services and there are costs associated with these services after the
Free Tier usage - please see
the [AWS Pricing](https://aws.amazon.com/pricing)
page for details. You are responsible for any AWS costs incurred. No
warranty is implied in this example.

### Architecture

<image src="./architecture_diagram.png" width="1000"/>

The solution architecture provides for two distinct functions: populating the knowledge base with domain documents to
support RAG and automating the response to email inquiries.

The architecture workflow for populating the Knowledge base includes the following steps (round numbered callouts on
right-hand side of diagram):

1. A user uploads documents which contain company and domain specific information, such as policy manuals, to an Amazon
   Simple Storage Service (Amazon S3) bucket configured as the knowledge base data source.
2. Amazon S3 invokes an AWS Lambda function to synchronize the data source with the knowledge base.
3. The Lambda functions starts data ingestion by calling the StartIngestionJob API function.
4. The knowledge base splits the documents in the data source into manageable chunks for efficient retrieval. The
   knowledge base is set up to
   use [Amazon OpenSearch Serverless](https://aws.amazon.com/opensearch-service/features/serverless/) as its vector
   store and an [Amazon Titan embedding text
   model](https://docs.aws.amazon.com/bedrock/latest/userguide/titan-embedding-models.html) to create the embeddings. In
   this
   step, [Knowledge Bases for Amazon Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base.html)
   converts the chunks to embeddings
   and writes to a vector index in the OpenSearch vector store, while maintaining a mapping to the original document.
   For more information about vector stores, see Set up a vector index for your knowledge base in a supported vector
   store. For more information about supported embedding models, see Supported regions and models for Knowledge bases
   for Amazon Bedrock.

The architecture workflow for automating email responses using generative AI with the knowledge base includes the
following steps (square numbered steps starting on left side of diagram):

1. A customer sends a natural language email inquiry to an address configured within the company’s domain, such as
   info@example.com.
2. Amazon Simple Email Service receives the email and stores the entire email content to an Amazon S3 bucket with the
   unique email identifier as the object key.
3. An Amazon EventBridge rule is triggered upon receipt of the email in the Amazon S3 bucket and starts an AWS Step
   Function to coordinate the generation and send of the email response.
4. A Lambda function retrieves the email content from Amazon S3 to pass onto the next Lambda function.
5. The email identifier and a received timestamp is recorded in an Amazon DynamoDB table. The DynamoDB table can be used
   to track and analyze the generated email responses.
6. A Lambda function extracts the body of the email inquiry and constructs a prompt query based on the email body, then
   invokes the RetrieveAndGenerate API function of Amazon Bedrock to generate a response.
7. Knowledge Bases for Amazon Bedrock uses the Amazon Titan embedding model, converts the prompt query to a vector, and
   finds chunks that are semantically similar. The prompt is then augmented with the chunks that are retrieved from the
   knowledge base. The prompt alongside the additional context is then sent to an LLM for response generation. In this
   solution, we use Anthropic Claude Sonnet 3.0 as our LLM to generate user responses using additional context. Claude
   Sonnet 3.0 is a fast, affordable, and very capable model that can handle a range of tasks, including casual dialogue,
   text analysis, summarization, and document question-answering.
8. A Lambda function constructs an email reply from the generated response and transmits the email reply via Amazon
   Simple Email Service to the customer. Email tracking and disposition information is updated in the Amazon DynamoDB
   table.

OR

8. When an email response is not generated automatically, a Lambda function forwards the original email to an internal
   support team for review and response to customer. Email disposition information is updated in the Amazon DynamoDB
   table.

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

1. Configure an SES domain Identity to allow SES to send and receive messages. If you want to receive email on address
   for a domain managed in Route53, this will be autowired for you if you
   provide the ROUTE53_HOSTED_ZONE context variable. If you manage your domain in a different account or in a registrar
   besides Route53, see section: Manually Verify Domain Identity (Optional)
2. Clone repository and navigate to root
   directory ```git clone https://github.com/aws-samples/automated-emails-for-bedrock-knowledgebases.git && cd automated-emails-for-bedrock-knowledgebases```
3. Install Dependencies `npm install`
4. Deploy App
    ```sh
    cdk deploy --context emailSource={EMAIL_SOURCE} --context emailReviewDest={EMAIL_REVIEW_DEST} --context route53HostedZone {HOSTED_ZONE_NAME}
    ```
    ```sh
    #example 
    cdk deploy --context emailSource=help@mybedrockknowledgebaseapp.com --context emailReviewDest=support@mybedrockknowledgebaseapp.com --context route53HostedZone mybedrockkonwledgebaseapp.com
    ```
5. OPTIONAL - Request SES Production Access. At this point you will
   have [Amazon Simple Email](https://aws.amazon.com/ses/) configured with a
   verified domain identity in sandbox mode. You can now send email to any address in that domain. If you need to send
   emails to users with a different domain name you need
   to [request production access](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html)

# Manually Verify Domain Identity (Optional)

If your domain is not managed in Route53 or not managed in the account in which this CDK is being deploy, follow the
steps detailed [here](https://docs.aws.amazon.com/ses/latest/dg/creating-identities.html#verify-domain-procedure) to
manually verify your domain:

1. Create a Domain Identity in SES (Amazon SES->Identities->Create Identity)
2. Add DKIM records to your DNS provider - locate the generated CName records in the DKIM section and enter
   those into your DNS provider
3. Add DMARC record to your DNS provider - locate the generatedTXT record in the DMARC section and enter into
   your DNS provider
4. Wait for your DNS identity to be verified. You will receive an email that DKIM is setup
5. Add MX record for SES to be able to receive email for your domain (ex. inbound-smtp.{region}.amazonaws.com)

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

> To whom do I report an HR violation?

# Clean Up

To uninstall or tear down this stack, simply run the cdk destroy command

```shell
cdk destroy
```

# Useful Commands

* `cdk synth` Synthesize the CloudFormation template
* `cdk deploy` Deploy all