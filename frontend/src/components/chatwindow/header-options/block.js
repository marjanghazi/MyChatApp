import { updateConversationMeta } from "../../../services/chatService";
export const blockOption = async ({ selectedConversationId, authUser, selectedConversation }) => {
  if (!selectedConversationId || !authUser?.uid) return;
  const blockedBy = { ...(selectedConversation?.blockedBy || {}), [authUser.uid]: true };
  await updateConversationMeta(selectedConversationId, { blockedBy });
};
