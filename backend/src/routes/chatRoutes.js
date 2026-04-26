import { Router } from "express";
import {
  deleteForEveryone,
  deleteForMe,
  deleteSignal,
  editMessage,
  listCallLogs,
  listSignals,
  listThreadMessages,
  markConversationSeen,
  sendMessage,
  toggleMessageFlag,
} from "../controllers/chatController.js";

const router = Router();

router.post("/messages/send", sendMessage);
router.patch("/messages/edit", editMessage);
router.patch("/messages/delete-for-me", deleteForMe);
router.patch("/messages/delete-for-everyone", deleteForEveryone);
router.patch("/messages/toggle-flag", toggleMessageFlag);
router.get("/messages", listThreadMessages);
router.get("/call-logs", listCallLogs);
router.get("/signals", listSignals);
router.delete("/signals/:signalId", deleteSignal);
router.patch("/conversations/seen", markConversationSeen);

export default router;
