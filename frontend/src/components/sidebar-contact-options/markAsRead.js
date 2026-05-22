import { updateConversationMeta } from "../../services/chatService";

export const markAsRead = async ({ conversationId, conversation, authUser }) => {
  const unreadBy = { ...(conversation?.unreadBy || {}), [authUser.uid]: 0 };
  await updateConversationMeta(conversationId, { unreadBy });
};
