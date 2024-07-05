# Bedrock Knowledge Base Higher Level Construct

This Construct builds a Bedrock KnowledgeBase with the following components:
* S3 Bucket to hold the raw data before ingestion into the KB vector DB
* An OpenSearch Serverless collection - vector database that feeds the Retrieval Augmented Generation workflow
* An Index in the OpenSearch Serverless collection
* Bedrock KnowledgeBase instance with a user-defined embedding model
* DataSource for the Bedrock KnowledgeBase tied to the above-created S3 bucket

**NOTE**

Creation of an OpenSearch Serverless collection and the subsequent index cannot be created via CloudFormation alone.  Therefore a majority of the creation logic in theis construct is defined in a [Custom Resource](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.CustomResource.html).

** Props **

| Prop          | Description | 
|---------------| ----------- |
| namePrefix    | Character string to apppend to resources for uniqueness |
| embedModelArn | The ARN of the Embedding Model to use in the data ingestion feature | 