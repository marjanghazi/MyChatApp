import { clearConversationForUser } from "../../services/chatService";

export const clearChat = async ({ conversationId, authUser }) => {
  await clearConversationForUser(conversationId, authUser.uid);
};
