import { syncKnowledgeBase } from "../util/bedrockKnowledgeBaseAPIUtil";

export const handler = async (event: any): Promise<any> => {
  console.log(process.env.KNOWLEDGE_BASE_ID);
  console.log(process.env.DATA_SOURCE_ID);

  await syncKnowledgeBase(
    process.env.KNOWLEDGE_BASE_ID,
    process.env.DATA_SOURCE_ID,
  );
};
