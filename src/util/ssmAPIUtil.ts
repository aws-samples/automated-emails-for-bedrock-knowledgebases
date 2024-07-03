import {
  DeleteParameterCommand,
  GetParameterCommand,
  PutParameterCommand,
  SSMClient,
} from "@aws-sdk/client-ssm";

const AWS_REGION = process.env.AWS_REGION;
const ssmClient = new SSMClient({ region: AWS_REGION });

export const storeParameter = async (
  name: string,
  value: string,
  description?: string,
) => {
  console.log(`Store Parameter - ${name}`);

  try {
    await ssmClient.send(
      new PutParameterCommand({
        Type: "String",
        Name: name,
        Value: value,
        Overwrite: true,
        Description: description,
      }),
    );
  } catch (error) {
    if (error instanceof Error) {
      console.error(error);
    }
    throw new Error(`Failed to put parameter - ${name}`);
  }
};

export const retrieveParameter = async (name: string): Promise<string> => {
  console.log(`Store Parameters - ${name}`);

  try {
    const getParameterResponse = await ssmClient.send(
      new GetParameterCommand({
        Name: name,
      }),
    );
    if (getParameterResponse.Parameter?.Value) {
      return getParameterResponse.Parameter?.Value;
    } else {
      throw new Error(`Failed to retrieve parameter - ${name}`);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(error);
    }
    throw new Error(`Failed to retrieve parameter - ${name}`);
  }
};

export const deleteParameter = async (name: string) => {
  console.log(`Delete Parameter - ${name}`);
  try {
    await ssmClient.send(
      new DeleteParameterCommand({
        Name: name,
      }),
    );
  } catch (error) {
    if (error instanceof Error) {
      console.error(error);
    }
    throw new Error(`Failed to delete parameter - ${name}`);
  }
};
