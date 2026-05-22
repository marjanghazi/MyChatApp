import { updateConversationMeta } from "../../services/chatService";

export const archiveChat = async ({ conversationId, conversation, authUser }) => {
  const archivedBy = { ...(conversation?.archivedBy || {}), [authUser.uid]: true };
  await updateConversationMeta(conversationId, { archivedBy });
};
