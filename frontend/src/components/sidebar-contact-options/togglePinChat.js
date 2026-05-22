import { updateConversationMeta } from "../../services/chatService";

export const togglePinChat = async ({ conversationId, conversation, authUser }) => {
  const next = !(conversation?.pinnedBy?.[authUser.uid]);
  const pinnedBy = { ...(conversation?.pinnedBy || {}), [authUser.uid]: next };
  await updateConversationMeta(conversationId, { pinnedBy });
};
