import { contactInfoOption } from "./contactInfo";
import { searchOption } from "./search";
import { selectMessagesOption } from "./selectMessages";
import { toggleMuteOption } from "./toggleMute";
import { disappearingMessagesOption } from "./disappearingMessages";
import { toggleFavoriteHeaderOption } from "./toggleFavorite";
import { toggleListHeaderOption } from "./toggleList";
import { closeChatOption } from "./closeChat";
import { sendCallLinkOption } from "./sendCallLink";
import { scheduleCallOption } from "./scheduleCall";
import { reportOption } from "./report";
import { blockOption } from "./block";
import { clearChatHeaderOption } from "./clearChat";
import { safetyNumberOption } from "./safetyNumber";

export const headerOptionsHandlers = {
  contactInfo: contactInfoOption,
  search: searchOption,
  selectMessages: selectMessagesOption,
  toggleMute: toggleMuteOption,
  disappearingMessages: disappearingMessagesOption,
  toggleFavorite: toggleFavoriteHeaderOption,
  toggleList: toggleListHeaderOption,
  closeChat: closeChatOption,
  sendCallLink: sendCallLinkOption,
  scheduleCall: scheduleCallOption,
  report: reportOption,
  block: blockOption,
  clearChat: clearChatHeaderOption,
  safetyNumber: safetyNumberOption,
  deleteChat: clearChatHeaderOption,
};
