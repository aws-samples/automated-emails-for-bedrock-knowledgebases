import { Construct } from "constructs";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { AttributeType, TableV2 } from "aws-cdk-lib/aws-dynamodb";
import { Code, Function, Runtime } from "aws-cdk-lib/aws-lambda";
import path from "node:path";
import { LambdaInvoke } from "aws-cdk-lib/aws-stepfunctions-tasks";
import {
  Choice,
  Condition,
  DefinitionBody,
  LogLevel,
  StateMachine,
} from "aws-cdk-lib/aws-stepfunctions";
import { CfnOutput, Duration, Stack } from "aws-cdk-lib";

import { Rule } from "aws-cdk-lib/aws-events";
import { SfnStateMachine } from "aws-cdk-lib/aws-events-targets";
import { EmailIdentity, Identity, ReceiptRuleSet } from "aws-cdk-lib/aws-ses";
import { S3 } from "aws-cdk-lib/aws-ses-actions";
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  AwsSdkCall,
  PhysicalResourceId,
} from "aws-cdk-lib/custom-resources";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { Effect, PolicyStatement, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { HostedZone, MxRecord } from "aws-cdk-lib/aws-route53";

export interface IKnowledgeBaseEmailQueryProps {
  namePrefix: string;
  knowledgeBaseId: string;
  queryModelArn: string;
  recipientEmail: string;
  route53HostedZone?: string;
}

export class KnowledgeBaseEmailQuery extends Construct {
  constructor(
    scope: Construct,
    id: string,
    props: IKnowledgeBaseEmailQueryProps,
  ) {
    super(scope, id);

    const bucket = new Bucket(this, "EmailContentsBucket");

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
    } else {
      new EmailIdentity(this, "SESEmailIdentity", {
        identity: Identity.email(props.recipientEmail),
      });
    }

    // Create the Receipt Rule Set
    const sesRuleSet = new ReceiptRuleSet(this, "SESRuleSet", {
      rules: [
        {
          recipients: [props.recipientEmail],
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
    const setActiveReceiptRuleSetSdkCall: AwsSdkCall = {
      service: "SES",
      action: "setActiveReceiptRuleSet",
      physicalResourceId: PhysicalResourceId.of("SesCustomResource"),
      parameters: {
        RuleSetName: sesRuleSet.receiptRuleSetName,
      },
    };

    new AwsCustomResource(this, "SetActiveReceiptRuleSetCustomResource", {
      onCreate: setActiveReceiptRuleSetSdkCall,
      onUpdate: setActiveReceiptRuleSetSdkCall,
      logRetention: RetentionDays.ONE_WEEK,
      policy: AwsCustomResourcePolicy.fromStatements([
        new PolicyStatement({
          sid: "CanActivateSESRuleSet",
          effect: Effect.ALLOW,
          actions: ["ses:SetActiveReceiptRuleSet"],
          resources: ["*"],
        }),
      ]),
    });

    // DynamoDB Table for storage of questions and status
    new TableV2(this, "QuestionStatusTable", {
      partitionKey: {
        name: "PK",
        type: AttributeType.STRING,
      },
    });

    const writeToDynamoLambda = new Function(this, "WriteToDynamoFunction", {
      runtime: Runtime.PYTHON_3_12,
      handler: "writeToDynamo.handler",
      code: Code.fromAsset(path.join(__dirname, "functions")),
    });

    const writeToDynamoSFTask = new LambdaInvoke(
      this,
      "WriteToDynamoLambdaTask",
      {
        lambdaFunction: writeToDynamoLambda,
      },
    );

    const queryKBLambda = new Function(this, "QueryKBFunction", {
      runtime: Runtime.PYTHON_3_12,
      handler: "queryKB.handler",
      code: Code.fromAsset(path.join(__dirname, "functions")),
    });

    const queryKBSFTask = new LambdaInvoke(this, "QueryKBLambdaTask", {
      lambdaFunction: queryKBLambda,
    });

    const sendEmailToCustomerLambda = new Function(
      this,
      "SendEmailToCustomerFunction",
      {
        runtime: Runtime.PYTHON_3_12,
        handler: "sendEmailToCustomer.handler",
        code: Code.fromAsset(path.join(__dirname, "functions")),
      },
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
        runtime: Runtime.PYTHON_3_12,
        handler: "sendEmailToSupport.handler",
        code: Code.fromAsset(path.join(__dirname, "functions")),
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
        new Choice(this, "ConfidenceChoice")
          .when(
            Condition.numberGreaterThanEquals("$.Payload.confidence", 0.7),
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
