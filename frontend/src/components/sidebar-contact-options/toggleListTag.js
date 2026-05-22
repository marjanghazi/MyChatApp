import { updateConversationMeta } from "../../services/chatService";

export const toggleListTag = async ({ conversationId, conversation, authUser }) => {
  const next = !(conversation?.listedBy?.[authUser.uid]);
  const listedBy = { ...(conversation?.listedBy || {}), [authUser.uid]: next };
  await updateConversationMeta(conversationId, { listedBy });
};
