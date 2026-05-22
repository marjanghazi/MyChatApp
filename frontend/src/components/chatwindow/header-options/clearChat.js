export const clearChatHeaderOption = async ({ deleteChatHistory }) => {
  await deleteChatHistory();
};
