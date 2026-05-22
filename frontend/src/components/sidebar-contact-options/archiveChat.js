import { updateConversationMeta } from "../../services/chatService";

export const archiveChat = async ({ conversationId, conversation, authUser }) => {
  const next = !(conversation?.archivedBy?.[authUser.uid]);
  const archivedBy = { ...(conversation?.archivedBy || {}), [authUser.uid]: next };
  await updateConversationMeta(conversationId, { archivedBy });
};
