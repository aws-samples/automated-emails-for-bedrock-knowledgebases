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
    const emailSource = this.node.tryGetContext("emailSource");
    const emailReviewDest = this.node.tryGetContext("emailReviewDest");
    const route53HostedZone = this.node.tryGetContext("route53HostedZone");

    if (!emailSource) {
      console.error(
        "You must define both emailSource and emailReviewDest at deploy time. Cannot build CDK stack.  Provide values with --context (cdk deploy --context emailSource=foo.bar@baz.com --context emailReviewDest=foo.bar@baz.com)",
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
      emailSource: emailSource,
      emailReviewDest: emailReviewDest,
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
