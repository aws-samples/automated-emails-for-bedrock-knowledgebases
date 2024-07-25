import { Construct } from "constructs";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { Architecture, Code, Function, Runtime } from "aws-cdk-lib/aws-lambda";
import path from "node:path";
import { LambdaInvoke } from "aws-cdk-lib/aws-stepfunctions-tasks";
import {
  Choice,
  Condition,
  DefinitionBody,
  LogLevel,
  StateMachine,
} from "aws-cdk-lib/aws-stepfunctions";
import {
  CfnOutput,
  CustomResource,
  Duration,
  Names,
  RemovalPolicy,
  Stack,
} from "aws-cdk-lib";

import { Rule } from "aws-cdk-lib/aws-events";
import { SfnStateMachine } from "aws-cdk-lib/aws-events-targets";
import { EmailIdentity, Identity, ReceiptRuleSet } from "aws-cdk-lib/aws-ses";
import { S3 } from "aws-cdk-lib/aws-ses-actions";
import { Provider } from "aws-cdk-lib/custom-resources";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import {
  Effect,
  PolicyDocument,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { HostedZone, MxRecord } from "aws-cdk-lib/aws-route53";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { AttributeType, TableV2 } from "aws-cdk-lib/aws-dynamodb";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";

export interface IKnowledgeBaseEmailQueryProps {
  namePrefix: string;
  knowledgeBaseId: string;
  queryModelArn: string;
  emailSource: string;
  emailReviewDest: string;
  route53HostedZone?: string;
}

export class KnowledgeBaseEmailQuery extends Construct {
  constructor(
    scope: Construct,
    id: string,
    props: IKnowledgeBaseEmailQueryProps,
  ) {
    super(scope, id);

    const bucket = new Bucket(this, "EmailContentsBucket", {
      bucketName: `${Names.uniqueResourceName(this, { maxLength: 40 }).toLowerCase()}-emailcontents`,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    bucket.addToResourcePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        principals: [new ServicePrincipal("ses.amazonaws.com")],
        actions: ["s3:PutObject"],
        resources: [`${bucket.bucketArn}/*`],
      }),
    );

    new CfnOutput(this, "EmailContentsBucketOutput", {
      key: "EmailContentsBucketArn",
      value: bucket.bucketArn,
    });

    if (props.route53HostedZone) {
      // Domain name is managed in Route53.  Autowire
      const hostedZone = HostedZone.fromLookup(this, "PublicHostedZone", {
        domainName: props.route53HostedZone,
      });

      new MxRecord(this, "Route53MXRecord", {
        values: [
          {
            hostName: `inbound-smtp.${Stack.of(this).region}.amazonaws.com`,
            priority: 123,
          },
        ],
        zone: hostedZone,
      });

      new EmailIdentity(this, "SESEmailIdentity", {
        identity: Identity.publicHostedZone(hostedZone),
      });
    }

    // Create the Receipt Rule Set
    const sesRuleSet = new ReceiptRuleSet(this, "SESRuleSet", {
      rules: [
        {
          recipients: [props.emailSource],
          actions: [
            new S3({
              bucket,
              objectKeyPrefix: "emails/",
            }),
          ],
        },
      ],
    });

    /*
     * Enable the Receipt Rule Set - NOTE: this is not supported with bare CloudFormation calls, so this is a custom resource to activate the rule set after creation
     */
    const activateAndDeactivateRuleSetCustomResourceFunction =
      new NodejsFunction(
        this,
        "activateAndDeactivateRuleSetCustomResourceLambda",
        {
          entry: path.join(
            __dirname,
            "custom",
            "activateAndDeactivateRuleSet.ts",
          ),
          handler: "handler",
          runtime: Runtime.NODEJS_LATEST,
          architecture: Architecture.ARM_64,
          timeout: Duration.seconds(30),
          role: new Role(this, "activateAndDeactivateRuleSetLambdaRole", {
            assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
            inlinePolicies: {
              policy: new PolicyDocument({
                statements: [
                  new PolicyStatement({
                    sid: "canInvokeSES",
                    effect: Effect.ALLOW,
                    actions: ["ses:SetActiveReceiptRuleSet"],
                    resources: ["*"],
                  }),
                ],
              }),
            },
          }),
          functionName: `${Names.uniqueResourceName(this, { maxLength: 25 }).toLowerCase()}-activateAndDeactivateRuleSetLambda`,
        },
      );

    const customResourceProvider = new Provider(
      this,
      "receiptRuleSetCustomResourceProvider",
      {
        onEventHandler: activateAndDeactivateRuleSetCustomResourceFunction,
        logRetention: RetentionDays.ONE_WEEK,
      },
    );

    new CustomResource(this, "activateAndDeactivateRuleSetCustomResource", {
      serviceToken: customResourceProvider.serviceToken,
      properties: {
        RuleSetName: sesRuleSet.receiptRuleSetName,
      },
    });

    // DynamoDB Table for storage of questions and status
    const questionDynamoTable = new TableV2(this, "QuestionStatusTable", {
      partitionKey: {
        name: "email_id",
        type: AttributeType.STRING,
      },
      removalPolicy: RemovalPolicy.DESTROY,
    });

    new StringParameter(this, "DynamoTableParam", {
      parameterName: `/${props.namePrefix}/QuestionDynamoTableArn`,
      stringValue: questionDynamoTable.tableArn,
    });

    const writeToDynamoLambda = new Function(this, "WriteToDynamoFunction", {
      functionName: `${Names.uniqueResourceName(this, { maxLength: 40 }).toLowerCase()}-writeToDynamo`,
      runtime: Runtime.PYTHON_3_12,
      handler: "writeToDynamo.handler",
      code: Code.fromAsset(path.join(__dirname, "functions")),
      environment: {
        DDB_TABLE: questionDynamoTable.tableName,
      },
      timeout: Duration.seconds(30),
      description: "Lambda to write email to DynamoDB",
    });

    writeToDynamoLambda.role?.addToPrincipalPolicy(
      new PolicyStatement({
        sid: "canReadFromEmailSourceS3Bucket",
        effect: Effect.ALLOW,
        actions: ["s3:GetObject"],
        resources: [`${bucket.bucketArn}/*`],
      }),
    );

    writeToDynamoLambda.role?.addToPrincipalPolicy(
      new PolicyStatement({
        sid: "canWriteToDynamoDBTable",
        effect: Effect.ALLOW,
        actions: ["dynamodb:PutItem"],
        resources: [questionDynamoTable.tableArn],
      }),
    );

    const writeToDynamoSFTask = new LambdaInvoke(
      this,
      "WriteToDynamoLambdaTask",
      {
        lambdaFunction: writeToDynamoLambda,
      },
    );

    const queryKBLambda = new Function(this, "QueryKBFunction", {
      functionName: `${Names.uniqueResourceName(this, { maxLength: 40 }).toLowerCase()}-queryKB`,
      runtime: Runtime.PYTHON_3_12,
      handler: "queryKB.handler",
      code: Code.fromAsset(path.join(__dirname, "functions")),
      environment: {
        KNOWLEDGE_BASE_ID: props.knowledgeBaseId,
        MODEL_ARN: props.queryModelArn,
      },
      timeout: Duration.seconds(30),
      description: "Lambda to query the Bedrock Knowledgebase",
    });

    queryKBLambda.role?.addToPrincipalPolicy(
      new PolicyStatement({
        sid: "canRetrieveAndGenerateKB",
        effect: Effect.ALLOW,
        actions: ["bedrock:Retrieve*"],
        resources: [
          `arn:aws:bedrock:${Stack.of(this).region}:${Stack.of(this).account}:knowledge-base/${props.knowledgeBaseId}`,
        ],
      }),
    );

    queryKBLambda.role?.addToPrincipalPolicy(
      new PolicyStatement({
        sid: "canInvokeModel",
        effect: Effect.ALLOW,
        actions: ["bedrock:InvokeModel"],
        resources: [props.queryModelArn],
      }),
    );

    const queryKBSFTask = new LambdaInvoke(this, "QueryKBLambdaTask", {
      lambdaFunction: queryKBLambda,
    });

    const sendEmailToCustomerLambda = new Function(
      this,
      "SendEmailToCustomerFunction",
      {
        functionName: `${Names.uniqueResourceName(this, { maxLength: 40 }).toLowerCase()}-sendEmailToCX`,
        runtime: Runtime.PYTHON_3_12,
        handler: "sendEmailToCustomer.handler",
        code: Code.fromAsset(path.join(__dirname, "functions")),
        environment: {
          DDB_TABLE: questionDynamoTable.tableName,
          EMAIL_SOURCE: props.emailSource,
        },
        timeout: Duration.seconds(30),
        description: "Lambda to send response email to original requester",
      },
    );

    sendEmailToCustomerLambda.role?.addToPrincipalPolicy(
      new PolicyStatement({
        sid: "canSendEmail",
        effect: Effect.ALLOW,
        actions: ["ses:SendEmail"],
        resources: ["*"],
      }),
    );

    // Permission to update DynamoDB item
    sendEmailToCustomerLambda.role?.addToPrincipalPolicy(
      new PolicyStatement({
        sid: "canUpdateDynamoDBItem",
        effect: Effect.ALLOW,
        actions: ["dynamodb:UpdateItem"],
        resources: [questionDynamoTable.tableArn],
      }),
    );

    const sendEmailToCustomerSFTask = new LambdaInvoke(
      this,
      "SendEmailToCustomerLambdaTask",
      {
        lambdaFunction: sendEmailToCustomerLambda,
      },
    );

    const sendEmailToSupportLambda = new Function(
      this,
      "SendEmailToSupportFunction",
      {
        functionName: `${Names.uniqueResourceName(this, { maxLength: 40 }).toLowerCase()}-sendEmailToSupport`,
        runtime: Runtime.PYTHON_3_12,
        handler: "sendEmailToSupport.handler",
        code: Code.fromAsset(path.join(__dirname, "functions")),
        environment: {
          DDB_TABLE: questionDynamoTable.tableName,
          EMAIL_SOURCE: props.emailSource,
          EMAIL_REVIEW_DEST: props.emailReviewDest,
        },
        timeout: Duration.seconds(30),
        description:
          "Lambda to send email to support for review if response was not generated",
      },
    );

    const sendEmailToSupportSFTask = new LambdaInvoke(
      this,
      "SendEmailToSupportLambdaTask",
      {
        lambdaFunction: sendEmailToSupportLambda,
      },
    );

    const stepFunctionChain = writeToDynamoSFTask
      .next(queryKBSFTask)
      .next(
        new Choice(this, "ResponseGenerated")
          .when(
            Condition.booleanEquals("$.Payload.response_generated", true),
            sendEmailToCustomerSFTask,
          )
          .otherwise(sendEmailToSupportSFTask),
      );

    const stepFunctionLogGroup = new LogGroup(this, "StepFunctionLogGroup", {
      retention: RetentionDays.ONE_DAY,
    });

    const stateMachine = new StateMachine(
      this,
      "EmailBedrockKnowledgeBaseStateMachine",
      {
        definitionBody: DefinitionBody.fromChainable(stepFunctionChain),
        timeout: Duration.minutes(10),
        comment:
          "State machine for querying knowledge base and responding to customer",
        logs: {
          destination: stepFunctionLogGroup,
          level: LogLevel.ALL,
        },
      },
    );

    stateMachine.addToRolePolicy(
      new PolicyStatement({
        sid: "canWriteToCloudWatchLogs",
        effect: Effect.ALLOW,
        actions: ["logs:*"],
        resources: [stepFunctionLogGroup.logGroupArn],
      }),
    );

    // EventBridge rule to trigger Step Function when new question shows up in S3
    bucket.enableEventBridgeNotification();
    new Rule(this, "NewS3Object", {
      eventPattern: {
        source: ["aws.s3"],
        detailType: ["Object Created"],
        detail: {
          bucket: {
            name: [bucket.bucketName],
          },
        },
      },
      targets: [new SfnStateMachine(stateMachine)],
    });
  }
}
