import { App, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { BedrockKnowledgeBase } from "./constructs/bedrockKnowledgeBase/bedrockKnowledgeBaseConstruct";
import { KnowledgeBaseEmailQuery } from "./constructs/knowlegeBaseEmailQuery/knowledgeBaseEmailQueryConstruct";

export interface AutomateEmailsBedrockProps extends StackProps {
  namePrefix: string;
  embedModelArn: string;
  queryModelArn: string;
  recipientEmail: string;
  route53HostedZone: string;
}

export class AutomateEmailsBedrockStack extends Stack {
  constructor(scope: Construct, id: string, props: AutomateEmailsBedrockProps) {
    super(scope, id, props);

    const knowledgeBase = new BedrockKnowledgeBase(
      this,
      "automate-emails-bedrock-knowledgebase",
      {
        namePrefix: props.namePrefix,
        embedModelArn: props.embedModelArn,
      },
    );

    new KnowledgeBaseEmailQuery(this, "automate-emails-bedrock-query", {
      namePrefix: props.namePrefix,
      knowledgeBaseId: knowledgeBase.knowledgeBaseId,
      queryModelArn: props.queryModelArn,
      recipientEmail: props.recipientEmail,
    });
  }
}

// for development, use account/region from cdk cli
const devEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const app = new App();

const stackProps: AutomateEmailsBedrockProps = {
  env: devEnv,
  namePrefix: process.env.NAME_PREFIX || "automate-emails-bedrock",
  embedModelArn:
    process.env.EMBED_MODEL_ARN ||
    "arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-embed-text-v2:0",
  queryModelArn:
    process.env.QUERY_MODEL_ARN ||
    "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0",
  recipientEmail: process.env.RECIPIENT_EMAIL,
  route53HostedZone: process.env.ROUTE53_HOSTED_ZONE,
};

new AutomateEmailsBedrockStack(app, "automate-emails-bedrock-dev", stackProps);

app.synth();
