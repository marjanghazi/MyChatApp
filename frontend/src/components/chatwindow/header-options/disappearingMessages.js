import { updateConversationMeta } from "../../../services/chatService";

export const disappearingMessagesOption = async ({ selectedConversationId, authUser, selectedConversation }) => {
  if (!selectedConversationId || !authUser?.uid) return;
  const current = !!selectedConversation?.disappearingBy?.[authUser.uid];
  const disappearingBy = { ...(selectedConversation?.disappearingBy || {}), [authUser.uid]: !current };
  await updateConversationMeta(selectedConversationId, { disappearingBy });
};
