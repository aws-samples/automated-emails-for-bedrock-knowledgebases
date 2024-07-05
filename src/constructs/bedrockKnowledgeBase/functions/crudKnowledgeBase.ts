import {
  CdkCustomResourceEvent,
  CdkCustomResourceResponse,
  Context,
} from "aws-lambda";
import {
  createDataSource,
  createKnowledgeBase,
  deleteKnowledgeBase,
  updateKnowledgeBase,
} from "../../../util/bedrockKnowledgeBaseAPIUtil";
import {
  createAccessPolicy,
  createCollection,
  createEncryptionSecurityPolicy,
  createIndex,
  createNetworkSecurityPolicy,
  deleteAccessPolicy,
  deleteCollection,
  deleteSecurityPolicy,
  updateCollection,
} from "../../../util/openSearchServerlessAPIUtil";
import { deleteParameter } from "../../../util/ssmAPIUtil";

export const handler = async (
  event: CdkCustomResourceEvent,
  context: Context,
): Promise<CdkCustomResourceResponse> => {
  const requestType = event.RequestType;
  const requestProperties = event.ResourceProperties;
  let response: CdkCustomResourceResponse = {};

  switch (requestType) {
    case "Create":
      console.log("Creating resource");
      // Create access policy
      await createAccessPolicy({
        nameSuffix: requestProperties.nameSuffix,
        namePrefix: requestProperties.namePrefix,
        knowledgeBaseRoleArn: requestProperties.knowledgeBaseRoleArn,
        knowledgeBaseCustomResourceRole:
          requestProperties.knowledgeBaseCustomResourceRole,
        accessPolicyArns: requestProperties.accessPolicyArns,
      });
      await createNetworkSecurityPolicy({
        nameSuffix: requestProperties.nameSuffix,
        namePrefix: requestProperties.namePrefix,
      });
      await createEncryptionSecurityPolicy({
        nameSuffix: requestProperties.nameSuffix,
        namePrefix: requestProperties.namePrefix,
      });
      const collection = await createCollection({
        nameSuffix: requestProperties.nameSuffix,
        namePrefix: requestProperties.namePrefix,
      });
      await createIndex({
        host: collection.collectionEndpoint!,
        nameSuffix: requestProperties.nameSuffix,
        namePrefix: requestProperties.namePrefix,
      });
      const knowledgeBase = await createKnowledgeBase({
        knowledgeBaseRoleArn: requestProperties.knowledgeBaseRoleArn,
        nameSuffix: requestProperties.nameSuffix,
        namePrefix: requestProperties.namePrefix,
        knowledgeBaseEmbeddingModelArn:
          requestProperties.knowledgeBaseEmbeddingModelArn,
        collectionArn: collection.arn!,
      });
      const dataSource = await createDataSource({
        knowledgeBaseBucketArn: requestProperties.knowledgeBaseBucketArn,
        knowledgeBaseId: knowledgeBase.knowledgeBase?.knowledgeBaseId!,
        nameSuffix: requestProperties.nameSuffix,
        namePrefix: requestProperties.namePrefix,
      });
      response.Data = {
        collectionArn: collection.arn!,
        collectionId: collection.id!,
        collectionName: collection.name!,
        collectionEndpoint: collection.collectionEndpoint,
        dataSourceId: dataSource?.dataSource?.dataSourceId,
        knowledgeBaseId: knowledgeBase.knowledgeBase?.knowledgeBaseId,
      };
      response.Status = "SUCCESS";
      response.Reason = "CreateKnowledgeBaseSuccessful";
      break;
    case "Update":
      console.log("Updating resource");
      const collectionInfo = await updateCollection({
        nameSuffix: requestProperties.nameSuffix,
        namePrefix: requestProperties.namePrefix,
      });
      const knowledgeBaseInfo = await updateKnowledgeBase({
        nameSuffix: requestProperties.nameSuffix,
        namePrefix: requestProperties.namePrefix,
      });
      response.Data = {
        collectionArn: collectionInfo.collectionArn,
        collectionId: collectionInfo.collectionId,
        collectionName: collectionInfo.collectionName,
        collectionEndpoint: collectionInfo.collectionEndpoint,
        dataSourceId: knowledgeBaseInfo.dataSourceId,
        knowledgeBaseId: knowledgeBaseInfo.knowledgeBaseId,
      };
      response.Status = "SUCCESS";
      response.Reason = "UpdateKnowledgeBase successful";
      break;
    case "Delete":
      console.log("Deleting resource");
      await deleteAccessPolicy({
        nameSuffix: requestProperties.nameSuffix,
        namePrefix: requestProperties.namePrefix,
      });
      await deleteSecurityPolicy({
        nameSuffix: requestProperties.nameSuffix,
        namePrefix: requestProperties.namePrefix,
        type: "network",
      });
      await deleteSecurityPolicy({
        nameSuffix: requestProperties.nameSuffix,
        namePrefix: requestProperties.namePrefix,
        type: "encryption",
      });
      await deleteCollection({
        nameSuffix: requestProperties.nameSuffix,
        namePrefix: requestProperties.namePrefix,
      });
      await deleteKnowledgeBase({
        nameSuffix: requestProperties.nameSuffix,
        namePrefix: requestProperties.namePrefix,
      });
      await deleteParameter(
        `/${requestProperties.namePrefix}-${requestProperties.nameSuffix}/collectionArn`,
      );
      await deleteParameter(
        `/${requestProperties.namePrefix}-${requestProperties.nameSuffix}/collectionEndpoint`,
      );
      await deleteParameter(
        `/${requestProperties.namePrefix}-${requestProperties.nameSuffix}/collectionId`,
      );
      await deleteParameter(
        `/${requestProperties.namePrefix}-${requestProperties.nameSuffix}/collectionName`,
      );
      await deleteParameter(
        `/${requestProperties.namePrefix}-${requestProperties.nameSuffix}/dataSourceId`,
      );
      await deleteParameter(
        `/${requestProperties.namePrefix}-${requestProperties.nameSuffix}/knowledgeBaseArn`,
      );
      await deleteParameter(
        `/${requestProperties.namePrefix}-${requestProperties.nameSuffix}/knowledgeBaseId`,
      );

      response.Status = "SUCCESS";
      response.Reason = "DeleteKnowledgeBase successful";
      break;
  }

  response.StackId = event.StackId;
  response.RequestId = event.RequestId;
  response.LogicalResourceId = event.LogicalResourceId;
  response.PhysicalResourceId = context.logGroupName;

  console.log(`Response: ${JSON.stringify(response)}`);
  return response;
};
