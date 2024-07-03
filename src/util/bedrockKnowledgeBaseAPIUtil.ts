import { randomUUID } from "node:crypto";
import {
  BedrockAgentClient,
  CreateDataSourceCommand,
  CreateKnowledgeBaseCommand,
  CreateKnowledgeBaseCommandOutput,
  DeleteKnowledgeBaseCommand,
  StartIngestionJobCommand,
} from "@aws-sdk/client-bedrock-agent";
import { retrieveParameter, storeParameter } from "./ssmAPIUtil";

const AWS_REGION = process.env.AWS_REGION;
const bedrockAgentClient = new BedrockAgentClient({ region: AWS_REGION });

interface CreateKnowledgeBaseProps {
  knowledgeBaseRoleArn: string;
  nameSuffix: string;
  namePrefix: string;
  knowledgeBaseEmbeddingModelArn: string;
  collectionArn: string;
}

export const createKnowledgeBase = async (
  params: CreateKnowledgeBaseProps,
): Promise<CreateKnowledgeBaseCommandOutput> => {
  console.log("Creating KnowledgeBase");
  const {
    knowledgeBaseRoleArn,
    nameSuffix,
    namePrefix,
    knowledgeBaseEmbeddingModelArn,
    collectionArn,
  } = params;
  await new Promise((resolve) => setTimeout(resolve, 60000));
  try {
    console.log(
      `Collection Arn: ${collectionArn}, Embedding Model Arn: ${knowledgeBaseEmbeddingModelArn}, Role Arn: ${knowledgeBaseRoleArn}`,
    );
    const data = await bedrockAgentClient.send(
      new CreateKnowledgeBaseCommand({
        clientToken: randomUUID(),
        name: `${namePrefix}-${nameSuffix}`,
        roleArn: knowledgeBaseRoleArn,
        knowledgeBaseConfiguration: {
          type: "VECTOR",
          vectorKnowledgeBaseConfiguration: {
            embeddingModelArn: knowledgeBaseEmbeddingModelArn,
          },
        },
        storageConfiguration: {
          type: "OPENSEARCH_SERVERLESS",
          opensearchServerlessConfiguration: {
            collectionArn: collectionArn,
            vectorIndexName: `${namePrefix}-${nameSuffix}`,
            fieldMapping: {
              vectorField: `${namePrefix}-vector`,
              textField: "text",
              metadataField: "metadata",
            },
          },
        },
      }),
    );
    if (
      data &&
      data.knowledgeBase &&
      data.knowledgeBase.knowledgeBaseId &&
      data.knowledgeBase.knowledgeBaseArn
    ) {
      console.log("KnowledgeBase created");
      await storeParameter(
        `/${namePrefix}-${nameSuffix}/knowledgeBaseId`,
        data.knowledgeBase.knowledgeBaseId,
      );
      await storeParameter(
        `/${namePrefix}-${nameSuffix}/knowledgeBaseArn`,
        data.knowledgeBase.knowledgeBaseArn,
      );
      return data;
    } else {
      throw new Error("Failed to create Knowledge Base");
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(error);
    }
    throw new Error("Failed to create Knowledge Base");
  }
};

interface CreateDataSourceProps {
  knowledgeBaseBucketArn: string;
  knowledgeBaseId: string;
  nameSuffix: string;
  namePrefix: string;
}

export const createDataSource = async (params: CreateDataSourceProps) => {
  console.log("Creating DataSource");
  const { knowledgeBaseBucketArn, knowledgeBaseId, nameSuffix, namePrefix } =
    params;
  try {
    const dataSourceCreateResponse = await bedrockAgentClient.send(
      new CreateDataSourceCommand({
        knowledgeBaseId: knowledgeBaseId,
        clientToken: randomUUID(),
        name: `${namePrefix}-${nameSuffix}`,
        dataSourceConfiguration: {
          type: "S3",
          s3Configuration: {
            bucketArn: knowledgeBaseBucketArn,
            // inclusionPrefixes: ["knowledgeBase"],
          },
        },
      }),
    );
    if (
      dataSourceCreateResponse &&
      dataSourceCreateResponse.dataSource &&
      dataSourceCreateResponse.dataSource.dataSourceId
    ) {
      console.log("DataSource created");
      await storeParameter(
        `/${namePrefix}-${nameSuffix}/dataSourceId`,
        dataSourceCreateResponse.dataSource.dataSourceId,
      );
      return dataSourceCreateResponse;
    } else {
      throw new Error("Failed to create data source");
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(error);
    }
    throw new Error("Failed to create data source");
  }
};

export const syncKnowledgeBase = async (
  knowledgeBaseId: string,
  dataSourceId: string,
) => {
  try {
    const command = new StartIngestionJobCommand({
      knowledgeBaseId: knowledgeBaseId,
      dataSourceId: dataSourceId,
    });

    await bedrockAgentClient.send(command);
  } catch (error) {
    if (error instanceof Error) {
      console.error(error);
    }

    throw new Error("Failed to sync data source");
  }
};

interface UpdateKnowledgeBaseParams {
  nameSuffix: string;
  namePrefix: string;
}

export const updateKnowledgeBase = async (
  params: UpdateKnowledgeBaseParams,
) => {
  const { nameSuffix, namePrefix } = params;

  try {
    const knowledgeBaseId = await retrieveParameter(
      `/${namePrefix}-${nameSuffix}/knowledgeBaseId`,
    );
    const knowledgeBaseArn = await retrieveParameter(
      `/${namePrefix}-${nameSuffix}/knowledgeBaseArn`,
    );

    const dataSourceId = await retrieveParameter(
      `/${namePrefix}-${nameSuffix}/dataSourceId`,
    );
    return { knowledgeBaseId, knowledgeBaseArn, dataSourceId };
  } catch (error) {
    console.error("Error updating knowledge bases:", error);
    throw error;
  }
};

interface DeleteKnowledgeBaseParams {
  nameSuffix: string;
  namePrefix: string;
}

export const deleteKnowledgeBase = async (
  params: DeleteKnowledgeBaseParams,
) => {
  const { nameSuffix, namePrefix } = params;
  try {
    const knowledgeBaseId = await retrieveParameter(
      `/${namePrefix}-${nameSuffix}/knowledgeBaseId`,
    );
    await bedrockAgentClient.send(
      new DeleteKnowledgeBaseCommand({
        knowledgeBaseId: knowledgeBaseId,
      }),
    );
  } catch (error) {
    console.error("Error deleting knowledge bases:", error);
    throw error;
  }
};
