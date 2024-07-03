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
  StateMachine,
} from "aws-cdk-lib/aws-stepfunctions";
import { Duration } from "aws-cdk-lib";

import { Rule } from "aws-cdk-lib/aws-events";
import { SfnStateMachine } from "aws-cdk-lib/aws-events-targets";

export class KnowledgeBaseEmailQuery extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    // TODO: SES Configuration

    const bucket = new Bucket(this, "EmailContentsBucket");

    new TableV2(this, "QuestionStatusTable", {
      partitionKey: {
        name: "PK",
        type: AttributeType.STRING,
      },
    });

    const writeToDynamoLambda = new Function(this, "WriteToDynamoFunction", {
      runtime: Runtime.PYTHON_3_12,
      handler: "writeToDynamo.handler",
      code: Code.fromAsset(path.join(__dirname, "../functions")),
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
      code: Code.fromAsset(path.join(__dirname, "../functions")),
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
        code: Code.fromAsset(path.join(__dirname, "../functions")),
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
        code: Code.fromAsset(path.join(__dirname, "../functions")),
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

    const stateMachine = new StateMachine(
      this,
      "EmailBedrockKnowledgeBaseStateMachine",
      {
        definitionBody: DefinitionBody.fromChainable(stepFunctionChain),
        timeout: Duration.minutes(10),
        comment:
          "State machine for querying knowledge base and responding to customer",
      },
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
