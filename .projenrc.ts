import { awscdk } from "projen";
import { NodePackageManager, TrailingComma } from "projen/lib/javascript";

const project = new awscdk.AwsCdkTypeScriptApp({
  cdkVersion: "2.1.0",
  defaultReleaseBranch: "main",
  name: "automate-emails-bedrock",
  projenrcTs: true,
  packageManager: NodePackageManager.NPM,
  prettier: true,
  prettierOptions: {
    settings: {
      singleQuote: false,
      trailingComma: TrailingComma.ALL,
    },
  },
  license: "MIT",
  copyrightOwner: "Amazon.com",
  gitignore: [".idea/", "cdk.context.json"],
  context: {
    namePrefix: "automate-emails-bedrock",
    embedModelArn:
      "arn:aws:bedrock:us-east-1::foundation-model/amazon.titan-embed-text-v2:0",
    queryModelArn:
      "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0",
    emailSource: "",
    emailReviewDest: "",
    route53HostedZone: "",
  },
  deps: [
    "@aws-sdk/client-bedrock-agent@3.600.0",
    "@aws-sdk/client-opensearchserverless@3.600.0",
    "@aws-sdk/client-ssm@3.600.0",
    "@aws-sdk/credential-provider-node",
    "@opensearch-project/opensearch",
    "aws-lambda",
  ] /* Runtime dependencies of this module. */,
  // description: undefined,  /* The description is just a string that helps people understand the purpose of the package. */
  devDeps: ["@types/aws-lambda"] /* Build dependencies for this module. */,
  // packageName: undefined,  /* The "name" in package.json. */
});
project.synth();
