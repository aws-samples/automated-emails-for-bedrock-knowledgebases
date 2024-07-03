import { randomUUID } from "node:crypto";
import {
  BatchGetCollectionCommand,
  CollectionDetail,
  CreateAccessPolicyCommand,
  CreateCollectionCommand,
  CreateSecurityPolicyCommand,
  DeleteAccessPolicyCommand,
  DeleteCollectionCommand,
  DeleteSecurityPolicyCommand,
  OpenSearchServerlessClient,
} from "@aws-sdk/client-opensearchserverless";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { Client } from "@opensearch-project/opensearch";
import { AwsSigv4Signer } from "@opensearch-project/opensearch/aws";
import { retrieveParameter, storeParameter } from "./ssmAPIUtil";

const AWS_REGION = process.env.AWS_REGION;

const openSearchServerlessClient = new OpenSearchServerlessClient({
  region: AWS_REGION,
});

interface CreateAccessPolicyParams {
  nameSuffix: string;
  namePrefix: string;
  knowledgeBaseRoleArn: string;
  knowledgeBaseCustomResourceRole: string;
  accessPolicyArns: string;
}

export const createAccessPolicy = async (params: CreateAccessPolicyParams) => {
  console.log("Creating AccessPolicy");
  const {
    nameSuffix,
    namePrefix,
    knowledgeBaseRoleArn,
    knowledgeBaseCustomResourceRole,
    accessPolicyArns,
  } = params;

  const parsedArns: string[] = JSON.parse(accessPolicyArns);
  const principalArray = [
    ...parsedArns,
    knowledgeBaseRoleArn,
    knowledgeBaseCustomResourceRole,
  ];

  const policy = [
    {
      Rules: [
        {
          Resource: [`collection/${namePrefix}-${nameSuffix}`],
          Permission: [
            "aoss:DescribeCollectionItems",
            "aoss:CreateCollectionItems",
            "aoss:UpdateCollectionItems",
          ],
          ResourceType: "collection",
        },
        {
          Resource: [`index/${namePrefix}-${nameSuffix}/*`],
          Permission: [
            "aoss:UpdateIndex",
            "aoss:DescribeIndex",
            "aoss:ReadDocument",
            "aoss:WriteDocument",
            "aoss:CreateIndex",
          ],
          ResourceType: "index",
        },
      ],
      Principal: principalArray,
      Description: "",
    },
  ];

  console.log(`Access Policy: ${JSON.stringify(policy, null, 2)}`);
  try {
    const data = await openSearchServerlessClient.send(
      new CreateAccessPolicyCommand({
        clientToken: randomUUID(),
        name: `${namePrefix}-${nameSuffix}`,
        type: "data",
        policy: JSON.stringify(policy),
      }),
    );
    return data;
  } catch (error) {
    if (error instanceof Error) {
      console.error(error);
    }
  }
  throw new Error("Failed to create AccessPolicy");
};

interface DeleteAccessPolicyParams {
  nameSuffix: string;
  namePrefix: string;
}

export const deleteAccessPolicy = async (params: DeleteAccessPolicyParams) => {
  console.log("Deleting AccessPolicy");
  const { nameSuffix, namePrefix } = params;
  try {
    await openSearchServerlessClient.send(
      new DeleteAccessPolicyCommand({
        name: `${namePrefix}-${nameSuffix}`,
        type: "data",
      }),
    );
  } catch (error) {
    if (error instanceof Error) {
      console.error(error);
    }
    return;
  }
};

interface CreateNetworkSecurityPolicyParams {
  nameSuffix: string;
  namePrefix: string;
}

export const createNetworkSecurityPolicy = async (
  params: CreateNetworkSecurityPolicyParams,
) => {
  console.log("Creating Network SecurityPolicy");
  const { nameSuffix, namePrefix } = params;
  try {
    const policy = [
      {
        AllowFromPublic: true,
        Rules: [
          {
            ResourceType: "dashboard",
            Resource: [`collection/${namePrefix}-${nameSuffix}`],
          },
          {
            ResourceType: "collection",
            Resource: [`collection/${namePrefix}-${nameSuffix}`],
          },
        ],
      },
    ];
    const data = await openSearchServerlessClient.send(
      new CreateSecurityPolicyCommand({
        clientToken: randomUUID(),
        name: `${namePrefix}-${nameSuffix}`,
        type: "network",
        policy: JSON.stringify(policy),
      }),
    );
    return data;
  } catch (error) {
    if (error instanceof Error) {
      console.error(error);
    }
    throw new Error("Failed to create SecurityPolicy");
  }
};

interface CreateEncryptionSecurityPolicyParams {
  nameSuffix: string;
  namePrefix: string;
}

export const createEncryptionSecurityPolicy = async (
  params: CreateEncryptionSecurityPolicyParams,
) => {
  console.log("Creating Encryption SecurityPolicy");
  const { nameSuffix, namePrefix } = params;
  try {
    const data = await openSearchServerlessClient.send(
      new CreateSecurityPolicyCommand({
        clientToken: randomUUID(),
        name: `${namePrefix}-${nameSuffix}`,
        type: "encryption",
        policy: JSON.stringify({
          Rules: [
            {
              ResourceType: "collection",
              Resource: [`collection/${namePrefix}-${nameSuffix}`],
            },
          ],
          AWSOwnedKey: true,
        }),
      }),
    );
    return data;
  } catch (error) {
    if (error instanceof Error) {
      console.error(error);
    }
    throw new Error("Failed to create Encryption SecurityPolicy");
  }
};

interface DeleteSecurityPolicyParams {
  nameSuffix: string;
  namePrefix: string;
  type: "encryption" | "network";
}

export const deleteSecurityPolicy = async (
  params: DeleteSecurityPolicyParams,
) => {
  console.log("Deleting AccessPolicy");
  const { nameSuffix, namePrefix, type } = params;
  try {
    await openSearchServerlessClient.send(
      new DeleteSecurityPolicyCommand({
        name: `${namePrefix}-${nameSuffix}`,
        type: type,
      }),
    );
  } catch (error) {
    if (error instanceof Error) {
      console.error(error);
    }
    return;
  }
};

interface CreateCollectionParams {
  nameSuffix: string;
  namePrefix: string;
}

export const createCollection = async (
  params: CreateCollectionParams,
): Promise<CollectionDetail> => {
  const { nameSuffix, namePrefix } = params;
  console.log("Creating Collection");
  try {
    const createCollectionResponse = await openSearchServerlessClient.send(
      new CreateCollectionCommand({
        clientToken: randomUUID(),
        type: "VECTORSEARCH",
        name: `${namePrefix}-${nameSuffix}`,
      }),
    );
    const collectionId = createCollectionResponse.createCollectionDetail?.id!;

    const maxAttempts = 30;
    let attempts = 0;

    while (attempts < maxAttempts) {
      console.log(`Checking Collection Status Attempt: ${attempts}`);
      const batchGetCollectionResponse = await openSearchServerlessClient.send(
        new BatchGetCollectionCommand({
          ids: [collectionId],
        }),
      );

      const collections = batchGetCollectionResponse.collectionDetails;

      if (collections && collections.length > 0) {
        const collection = collections[0];
        console.log(`Collection Status: ${collection.status}`);
        if (collection.status === "ACTIVE") {
          await storeParameter(
            `/${namePrefix}-${nameSuffix}/collectionId`,
            collection.id!,
          );
          await storeParameter(
            `/${namePrefix}-${nameSuffix}/collectionArn`,
            collection.arn!,
          );
          await storeParameter(
            `/${namePrefix}-${nameSuffix}/collectionName`,
            collection.name!,
          );

          await storeParameter(
            `/${namePrefix}-${nameSuffix}/collectionEndpoint`,
            collection.collectionEndpoint!,
          );
          return collection;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 30000));
      attempts++;
    }

    throw new Error("Failed to create collection: Timeout exceeded");
  } catch (error) {
    if (error instanceof Error) {
      console.error(error);
    }
    console.error("Failed to create collection:", error);
    throw error;
  }
};

interface DeleteCollectionParams {
  nameSuffix: string;
  namePrefix: string;
}

export const deleteCollection = async (params: DeleteCollectionParams) => {
  console.log("Deleting Collection");
  const { nameSuffix, namePrefix } = params;

  const collectionId = await retrieveParameter(
    `/${namePrefix}-${nameSuffix}/collectionId`,
  );

  try {
    await openSearchServerlessClient.send(
      new DeleteCollectionCommand({
        id: collectionId,
      }),
    );
  } catch (error) {
    if (error instanceof Error) {
      console.error(error);
    }
    throw new Error("Failed to delete Collection");
  }
};

interface CreateIndexParams {
  host: string;
  nameSuffix: string;
  namePrefix: string;
}

export const createIndex = async (params: CreateIndexParams) => {
  const { host, nameSuffix, namePrefix } = params;
  console.log("Creating Index");
  await new Promise((resolve) => setTimeout(resolve, 60000));

  const client = new Client({
    ...AwsSigv4Signer({
      region: AWS_REGION!,
      service: "aoss",
      getCredentials: () => {
        const credentialsProvider = defaultProvider();
        return credentialsProvider();
      },
    }),
    node: host,
  });

  console.log(JSON.stringify(client));
  try {
    var createIndexResponse = await client.indices.create({
      index: `${namePrefix}-${nameSuffix}`,
      body: {
        settings: {
          "index.knn": true,
        },
        mappings: {
          properties: {
            [`${namePrefix}-vector`]: {
              type: "knn_vector",
              dimension: 1024,
              method: {
                name: "hnsw",
                engine: "faiss",
                parameters: {
                  ef_construction: 512,
                  m: 16,
                },
              },
            },
          },
        },
      },
    });

    console.log("Index Created " + createIndexResponse.statusCode);
    console.log(JSON.stringify(createIndexResponse.body, null, 2));
  } catch (error) {
    console.error(JSON.stringify(error, null, 2));
  }
};

interface updateCollectionParams {
  nameSuffix: string;
  namePrefix: string;
}

export const updateCollection = async (params: updateCollectionParams) => {
  console.log("Updating Collection");
  const { nameSuffix, namePrefix } = params;
  try {
    const collectionId = await retrieveParameter(
      `/${namePrefix}-${nameSuffix}/collectionId`,
    );

    const collectionName = await retrieveParameter(
      `/${namePrefix}-${nameSuffix}/collectionName`,
    );

    const collectionArn = await retrieveParameter(
      `/${namePrefix}-${nameSuffix}/collectionArn`,
    );

    const collectionEndpoint = await retrieveParameter(
      `/${namePrefix}-${nameSuffix}/collectionEndpoint`,
    );

    return { collectionId, collectionName, collectionEndpoint, collectionArn };
  } catch (error) {
    if (error instanceof Error) {
      console.error(error);
    }
    throw new Error("Failed to update Collection");
  }
};
