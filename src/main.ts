import { App, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { BedrockKnowledgeBase } from "./constructs/bedrockKnowledgeBase/bedrockKnowledgeBaseConstruct";
import { KnowledgeBaseEmailQuery } from "./constructs/knowlegeBaseEmailQuery/knowledgeBaseEmailQueryConstruct";

export class AutomateEmailsBedrockStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    const namePrefix = this.node.tryGetContext("namePrefix");
    const embedModelArn = this.node.tryGetContext("embedModelArn");
    const queryModelArn = this.node.tryGetContext("queryModelArn");
    const recipientEmail = this.node.tryGetContext("recipientEmail");
    const route53HostedZone = this.node.tryGetContext("route53HostedZone");

    if (!recipientEmail) {
      console.error(
        "No recipient email address defined.  Cannot build CDK stack.  Provide value with --context (cdk deploy --context recipientEmail=foo.bar@baz.com)",
      );
      process.exit(1);
    }

    const knowledgeBase = new BedrockKnowledgeBase(
      this,
      "automate-emails-bedrock-knowledgebase",
      {
        namePrefix: namePrefix,
        embedModelArn: embedModelArn,
      },
    );

    new KnowledgeBaseEmailQuery(this, "automate-emails-bedrock-query", {
      namePrefix: namePrefix,
      knowledgeBaseId: knowledgeBase.knowledgeBaseId,
      queryModelArn: queryModelArn,
      recipientEmail: recipientEmail,
      route53HostedZone: route53HostedZone,
    });
  }
}

// for development, use account/region from cdk cli
const devEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const app = new App();

new AutomateEmailsBedrockStack(app, "automate-emails-bedrock-dev", {
  env: devEnv,
});

app.synth();
