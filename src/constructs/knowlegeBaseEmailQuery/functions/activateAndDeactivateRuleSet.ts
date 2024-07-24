import { SESClient, SetActiveReceiptRuleSetCommand } from "@aws-sdk/client-ses";
import { CdkCustomResourceEvent, Context } from "aws-lambda";

export const handler = async (
  event: CdkCustomResourceEvent,
  context: Context,
) => {
  const client = new SESClient();

  const requestType = event.RequestType;

  let command: SetActiveReceiptRuleSetCommand;

  switch (requestType) {
    case "Create":
    case "Update":
      command = new SetActiveReceiptRuleSetCommand({
        RuleSetName: event.ResourceProperties.RuleSetName,
      });
      break;
    case "Delete":
      command = new SetActiveReceiptRuleSetCommand();
      break;
  }

  await client.send(command);
};
