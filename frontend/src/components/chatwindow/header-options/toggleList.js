import { updateConversationMeta } from "../../../services/chatService";
export const toggleListHeaderOption = async ({ selectedConversationId, authUser, selectedConversation }) => {
  if (!selectedConversationId || !authUser?.uid) return;
  const next = !(selectedConversation?.listedBy?.[authUser.uid]);
  const listedBy = { ...(selectedConversation?.listedBy || {}), [authUser.uid]: next };
  await updateConversationMeta(selectedConversationId, { listedBy });
};
