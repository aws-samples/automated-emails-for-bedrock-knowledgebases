import { CfnOutput, CustomResource, Duration, Names, Stack } from "aws-cdk-lib";
import {
  ArnPrincipal,
  CompositePrincipal,
  Effect,
  ManagedPolicy,
  PolicyDocument,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { Architecture, Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { Provider } from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";
import { Rule } from "aws-cdk-lib/aws-events";
import { LambdaFunction } from "aws-cdk-lib/aws-events-targets";

export interface IBedrockKnowledgeBaseProps {
  namePrefix: string;
  embedModelArn: string;
}

export class BedrockKnowledgeBase extends Construct {
  knowledgeBaseId: string;
  knowledgeBaseArn: string;
  collectionArn: string;
  collectionId: string;
  collectionName: string;
  collectionEndpoint: string;
  knowledgeBaseRole: Role;
  dataSourceId: string;

  constructor(scope: Construct, id: string, props: IBedrockKnowledgeBaseProps) {
    console.log(props);
    super(scope, id);

    // We're using a custom resource to generate most of this, so a Lambda will be executing the API calls.
    // This is a Role for our Lambda to assume with permissions to generate all resources
    const customResourceRole = new Role(
      this,
      "knowledgeBaseCustomResourceRole",
      {
        assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
        inlinePolicies: {
          ["bedrockPolicy"]: new PolicyDocument({
            statements: [
              new PolicyStatement({
                sid: "canModifyBedrockKnowledgeBases",
                actions: [
                  "bedrock:*KnowledgeBase",
                  "bedrock:*DataSource",
                  "iam:PassRole",
                ],
                resources: ["*"],
              }),
            ],
          }),
          ["ssmPolicy"]: new PolicyDocument({
            statements: [
              new PolicyStatement({
                sid: "canInteractWithSSMForRelatedParameters",
                actions: [
                  "ssm:PutParameter",
                  "ssm:GetParameter",
                  "ssm:DeleteParameter",
                ],
                resources: [
                  `arn:aws:ssm:${Stack.of(this).region}:${Stack.of(this).account}:parameter/${props.namePrefix}*`,
                ],
              }),
            ],
          }),
          ["aossPolicy"]: new PolicyDocument({
            statements: [
              new PolicyStatement({
                sid: "canAdminOpenSearch",
                actions: ["aoss:*", "iam:CreateServiceLinkedRole"],
                resources: ["*"],
              }),
            ],
          }),
        },
        managedPolicies: [
          ManagedPolicy.fromAwsManagedPolicyName(
            "service-role/AWSLambdaBasicExecutionRole",
          ),
        ],
      },
    );

    // IAM Role for Bedrock Knowledgebase
    this.knowledgeBaseRole = new Role(this, "BedrockKnowledgeBaseRole", {
      assumedBy: new CompositePrincipal(
        new ServicePrincipal("bedrock.amazonaws.com"),
        new ServicePrincipal("lambda.amazonaws.com"),
        new ArnPrincipal(customResourceRole.roleArn),
      ),
      inlinePolicies: {
        policy: new PolicyDocument({
          statements: [
            new PolicyStatement({
              sid: "canInvokeEmbeddingModel",
              effect: Effect.ALLOW,
              actions: ["bedrock:InvokeModel"],
              resources: [props.embedModelArn],
            }),
            new PolicyStatement({
              sid: "canAccessOpenSearchAPIForVectorDB",
              effect: Effect.ALLOW,
              actions: ["aoss:APIAccessAll"],
              resources: ["*"],
            }),
          ],
        }),
      },
    });

    const sourceBucket = new Bucket(this, "KnowledgeBaseSourceBucket");
    sourceBucket.grantReadWrite(this.knowledgeBaseRole);

    new CfnOutput(this, "KnowledgeBaseSourceBucketOutput", {
      key: "KnowledgeBaseSourceBucketArn",
      value: sourceBucket.bucketArn,
    });

    // Lambda Function to create Custom Resource
    const createKnowledgeBaseFunction = new NodejsFunction(
      this,
      "knowledgeBaseCustomResourceLambda",
      {
        entry:
          "./src/constructs/bedrockKnowledgeBase/functions/crudKnowledgeBase.ts",
        handler: "handler",
        runtime: Runtime.NODEJS_LATEST,
        architecture: Architecture.ARM_64,
        timeout: Duration.minutes(15),
        role: customResourceRole,
      },
    );

    // Create Provider
    const knowledgeBaseProvider = new Provider(this, "knowledgeBaseProvider", {
      onEventHandler: createKnowledgeBaseFunction,
      logRetention: RetentionDays.ONE_WEEK,
    });

    // Create Custom Resource
    const bedrockKnowledgeBaseCustomResource = new CustomResource(
      this,
      "knowledgeBaseCustomResource",
      {
        serviceToken: knowledgeBaseProvider.serviceToken,
        properties: {
          knowledgeBaseBucketArn: sourceBucket.bucketArn,
          knowledgeBaseRoleArn: this.knowledgeBaseRole.roleArn,
          knowledgeBaseCustomResourceRole: customResourceRole.roleArn,
          accessPolicyArns: JSON.stringify([
            `arn:aws:iam::${Stack.of(this).account}:role/Admin`,
          ]),
          nameSuffix: Names.uniqueId(this).slice(-6).toLowerCase(),
          namePrefix: props.namePrefix,
          knowledgeBaseEmbeddingModelArn: props.embedModelArn,
        },
      },
    );

    // Lambda role for syncing knowledge base
    const syncKnowledgeBaseRole = new Role(this, "syncKnowledgeBaseRole", {
      assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
      inlinePolicies: {
        ["ingestion"]: new PolicyDocument({
          statements: [
            new PolicyStatement({
              sid: "canStartBedrockKBIngestion",
              effect: Effect.ALLOW,
              actions: ["bedrock:StartIngestionJob"],
              resources: ["*"],
            }),
          ],
        }),
      },
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole",
        ),
      ],
    });

    // Lambda to trigger a resync of data source
    const syncDataSourceLambda = new NodejsFunction(
      this,
      "syncKnowledgeBaseLambda",
      {
        entry:
          "./src/constructs/bedrockKnowledgeBase/functions/syncKnowledgeBase.ts",
        handler: "handler",
        runtime: Runtime.NODEJS_LATEST,
        architecture: Architecture.ARM_64,
        timeout: Duration.minutes(15),
        role: syncKnowledgeBaseRole,
      },
    );

    syncDataSourceLambda.addEnvironment(
      "KNOWLEDGE_BASE_ID",
      bedrockKnowledgeBaseCustomResource.getAttString("knowledgeBaseId"),
    );
    syncDataSourceLambda.addEnvironment(
      "DATA_SOURCE_ID",
      bedrockKnowledgeBaseCustomResource.getAttString("dataSourceId"),
    );
    // EventBridge event
    sourceBucket.enableEventBridgeNotification();
    new Rule(this, "Updated KB Source", {
      eventPattern: {
        source: ["aws.s3"],
        detailType: ["Object Created", "Object Deleted"],
        detail: {
          bucket: {
            name: [sourceBucket.bucketName],
          },
        },
      },
      targets: [new LambdaFunction(syncDataSourceLambda)],
    });

    this.knowledgeBaseArn =
      bedrockKnowledgeBaseCustomResource.getAttString("knowledgeBaseArn");
    this.knowledgeBaseId =
      bedrockKnowledgeBaseCustomResource.getAttString("knowledgeBaseId");
    this.collectionArn =
      bedrockKnowledgeBaseCustomResource.getAttString("collectionArn");
    this.collectionId =
      bedrockKnowledgeBaseCustomResource.getAttString("collectionId");
    this.collectionName =
      bedrockKnowledgeBaseCustomResource.getAttString("collectionName");
    this.collectionEndpoint =
      bedrockKnowledgeBaseCustomResource.getAttString("collectionEndpoint");
    this.dataSourceId =
      bedrockKnowledgeBaseCustomResource.getAttString("dataSourceId");
  }
}
