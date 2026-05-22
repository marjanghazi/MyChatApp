import { updateConversationMeta } from "../../services/chatService";

export const toggleMuteNotifications = async ({ conversationId, conversation, authUser }) => {
  const next = !(conversation?.mutedBy?.[authUser.uid]);
  const mutedBy = { ...(conversation?.mutedBy || {}), [authUser.uid]: next };
  await updateConversationMeta(conversationId, { mutedBy });
};
