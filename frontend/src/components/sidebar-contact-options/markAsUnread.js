import { updateConversationMeta } from "../../services/chatService";

export const markAsUnread = async ({ conversationId, conversation, authUser }) => {
  const current = Number(conversation?.unreadBy?.[authUser.uid] || 0);
  const unreadBy = { ...(conversation?.unreadBy || {}), [authUser.uid]: Math.max(current, 1) };
  await updateConversationMeta(conversationId, { unreadBy });
};
