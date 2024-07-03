import { awscdk } from "projen";
import { TrailingComma } from "projen/lib/javascript";

const project = new awscdk.AwsCdkTypeScriptApp({
  cdkVersion: "2.1.0",
  defaultReleaseBranch: "main",
  name: "automate-emails-bedrock",
  projenrcTs: true,
  prettier: true,
  prettierOptions: {
    settings: {
      singleQuote: false,
      trailingComma: TrailingComma.ALL,
    },
  },
  gitignore: [".idea/"],

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
