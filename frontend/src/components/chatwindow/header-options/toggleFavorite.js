import { updateConversationMeta } from "../../../services/chatService";
export const toggleFavoriteHeaderOption = async ({ selectedConversationId, authUser, selectedConversation }) => {
  if (!selectedConversationId || !authUser?.uid) return;
  const next = !(selectedConversation?.favoriteBy?.[authUser.uid]);
  const favoriteBy = { ...(selectedConversation?.favoriteBy || {}), [authUser.uid]: next };
  await updateConversationMeta(selectedConversationId, { favoriteBy });
};
