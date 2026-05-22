import { updateConversationMeta } from "../../services/chatService";

export const toggleFavorite = async ({ conversationId, conversation, authUser }) => {
  const next = !(conversation?.favoriteBy?.[authUser.uid]);
  const favoriteBy = { ...(conversation?.favoriteBy || {}), [authUser.uid]: next };
  await updateConversationMeta(conversationId, { favoriteBy });
};
