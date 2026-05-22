export const closeChatOption = async ({ setStatusText, onOpenMobileSidebar }) => {
  setStatusText("Chat closed.");
  onOpenMobileSidebar?.();
};
